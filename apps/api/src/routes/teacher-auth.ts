import { Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { AuthEnv } from "../middleware/auth";
import { clearSessionCookie, hashSessionToken, isValidSessionToken, setSessionCookie, type AuthenticatedUser } from "../middleware/auth";

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

const SESSION_COOKIE = "nidhom_session";
const SESSION_IDLE_MS = 4 * 60 * 60 * 1000;
const SESSION_ABSOLUTE_MS = 12 * 60 * 60 * 1000;
const encoder = new TextEncoder();
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

    // Create a lightweight teacher session directly (no password required)
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
    ).bind(sessionId, guruId, tokenHash, idleExpiry, loginTime, loginTime).run();

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
