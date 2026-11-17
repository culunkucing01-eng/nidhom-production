import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { AuthEnv } from "../middleware/auth";
import { clearSessionCookie, hashSessionToken, isValidSessionToken, setSessionCookie } from "../middleware/auth";

interface TeacherAuthRow {
  id: string;
  username: string;
  role: string;
  is_active: number;
  must_change_password: number;
  teacher_id: string | null;
  teacher_code: string | null;
  teacher_name: string | null;
}

interface TeacherAccountRow {
  user_id: string | null;
  username: string | null;
  role: string | null;
}

const SESSION_COOKIE = "nidhom_session";
const SESSION_IDLE_MS = 4 * 60 * 60 * 1000;
const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;
const MAX_REQUEST_BYTES = 4096;

function createSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createId(): string {
  return crypto.randomUUID();
}

const teacherAuthRoutes = new Hono<AuthEnv>();

// ── GET /api/teacher/guru-list ──────────────────────────────────────────────
// Returns all active teachers for the name-selection autocomplete
teacherAuthRoutes.get("/guru-list", async (c) => {
  try {
    const { results } = await c.env.DB
      .prepare("SELECT id, kode, nama FROM guru WHERE is_active = 1 ORDER BY nama ASC")
      .all<{ id: string; kode: string; nama: string }>();
    return c.json({ gurus: results ?? [] });
  } catch {
    console.error("Guru list query failed.");
    return c.json({ error: "Daftar guru tidak dapat dimuat." }, 500);
  }
});

// ── POST /api/teacher/login ─────────────────────────────────────────────────
// Teacher logs in by selecting their name (no password).
// The frontend must send: { guru_id: "<uuid>" }
teacherAuthRoutes.post("/login", async (c) => {
  if (!c.req.header("Origin")) {
    return c.json({ error: "Forbidden" }, 403);
  }

  try {
    const raw = await c.req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_REQUEST_BYTES) {
      return c.json({ error: "Payload terlalu besar." }, 413);
    }
    const body = JSON.parse(raw);
    const guruId = typeof body?.guru_id === "string" ? body.guru_id.trim() : "";
    if (!guruId) {
      return c.json({ error: "Pilih nama guru terlebih dahulu." }, 400);
    }

    // Look up the guru
    const guru = await c.env.DB
      .prepare("SELECT id, kode, nama FROM guru WHERE id = ? AND is_active = 1 LIMIT 1")
      .bind(guruId)
      .first<{ id: string; kode: string; nama: string }>();

    if (!guru) {
      return c.json({ error: "Guru tidak ditemukan atau tidak aktif." }, 404);
    }

    // Sesi tetap memakai sessions.user_id -> users.id. Guru bukan users.id,
    // sehingga akun TEACHER dan relasi teacher_auth harus tersedia lebih dulu.
    const account = await c.env.DB.prepare(
      `SELECT u.id AS user_id, u.username, u.role
       FROM guru g
       LEFT JOIN teacher_auth ta ON ta.guru_id = g.id
       LEFT JOIN users u ON u.id = ta.user_id
       WHERE g.id = ? AND g.is_active = 1
       LIMIT 1`,
    )
      .bind(guru.id)
      .first<TeacherAccountRow>();

    let userId = account?.user_id ?? null;
    if (account?.user_id && account.role !== "TEACHER") {
      return c.json({ error: "Akun guru tidak valid." }, 409);
    }

    if (!userId) {
      const existingByUsername = await c.env.DB.prepare(
        "SELECT id, role FROM users WHERE username = ? COLLATE NOCASE LIMIT 1",
      )
        .bind(guru.kode)
        .first<{ id: string; role: string }>();

      if (existingByUsername && existingByUsername.role !== "TEACHER") {
        return c.json({ error: "Kode guru sudah dipakai akun lain." }, 409);
      }

      userId = existingByUsername?.id ?? createId();
      const passwordHash = `teacher-no-password$${createId()}`;
      const nowIso = new Date().toISOString();
      const statements = [];

      if (!existingByUsername) {
        statements.push(
          c.env.DB.prepare(
            `INSERT INTO users
             (id, username, password_hash, role, is_active, must_change_password, failed_login_attempts, created_at, updated_at)
             VALUES (?, ?, ?, 'TEACHER', 1, 0, 0, ?, ?)`,
          ).bind(userId, guru.kode, passwordHash, nowIso, nowIso),
        );
      } else {
        statements.push(
          c.env.DB.prepare(
            `UPDATE users
             SET role = 'TEACHER', is_active = 1, must_change_password = 0,
                 failed_login_attempts = 0, locked_until = NULL, updated_at = ?
             WHERE id = ?`,
          ).bind(nowIso, userId),
        );
      }

      statements.push(
        c.env.DB.prepare(
          `INSERT INTO teacher_auth (id, user_id, guru_id, created_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(guru_id) DO UPDATE SET user_id = excluded.user_id`,
        ).bind(createId(), userId, guru.id, nowIso),
      );
      await c.env.DB.batch(statements);
    }

    // Create a teacher session using the users primary key (no password required).
    const now = Date.now();
    const loginTime = new Date(now).toISOString();
    const absoluteExpiry = new Date(now + SESSION_ABSOLUTE_MS).toISOString();
    const idleExpiry = new Date(Math.min(now + SESSION_IDLE_MS, now + SESSION_ABSOLUTE_MS)).toISOString();
    const token = createSessionToken();
    const tokenHash = await hashSessionToken(token);
    const sessionId = createId();

    await c.env.DB.prepare(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at, last_activity_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).bind(sessionId, userId, tokenHash, idleExpiry, loginTime, loginTime).run();

    setSessionCookie(c, token, idleExpiry, now);

    return c.json({
      user: {
        id: guru.id,
        username: guru.kode,
        role: "TEACHER" as const,
        mustChangePassword: false,
        teacher: { id: guru.id, code: guru.kode, name: guru.nama },
      },
    });
  } catch {
    console.error("Teacher login failed.");
    return c.json({ error: "Login gagal." }, 500);
  }
});

// ── POST /api/teacher/logout ─────────────────────────────────────────────────
teacherAuthRoutes.post("/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token && isValidSessionToken(token)) {
    const tokenHash = await hashSessionToken(token);
    await c.env.DB.prepare(
      "UPDATE sessions SET revoked_at = datetime('now') WHERE token_hash = ? AND revoked_at IS NULL",
    ).bind(tokenHash).run();
  }
  clearSessionCookie(c);
  return c.json({ ok: true });
});

export default teacherAuthRoutes;
