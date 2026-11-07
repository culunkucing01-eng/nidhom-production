import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import { hashPassword, verifyPassword } from "../lib/password";
import {
  clearSessionCookie,
  hashSessionToken,
  isValidSessionToken,
  setSessionCookie,
  type AuthEnv,
  type AuthenticatedUser,
  type UserRole,
} from "../middleware/auth";

const SESSION_COOKIE = "nidhom_session";
const SESSION_IDLE_MS = 8 * 60 * 60 * 1000;
const SESSION_ABSOLUTE_MS = 24 * 60 * 60 * 1000;
const MAX_PASSWORD_BYTES = 1024;
const MAX_USERNAME_BYTES = 128;
const MAX_REQUEST_BYTES = 4096;
const FAILED_LOGIN_LIMIT = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const encoder = new TextEncoder();

class LoginRateLimitUnavailableError extends Error {}

interface LoginUserRow {
  id: string;
  username: string;
  password_hash: string;
  role: UserRole;
  is_active: number;
  must_change_password: number;
  failed_login_attempts: number;
  locked_until: string | null;
  teacher_id: string | null;
  teacher_code: string | null;
  teacher_name: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  const contentType = request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return null;
  }

  const contentLength = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return null;
  }

  try {
    const body = await request.text();
    if (encoder.encode(body).byteLength > MAX_REQUEST_BYTES) {
      return null;
    }

    const value: unknown = JSON.parse(body);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

function isPassword(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    encoder.encode(value).byteLength <= MAX_PASSWORD_BYTES
  );
}

function normalizedUsername(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const username = value.trim();
  if (
    username.length === 0 ||
    encoder.encode(username).byteLength > MAX_USERNAME_BYTES ||
    /[\u0000-\u001f\u007f]/.test(username)
  ) {
    return null;
  }

  return username;
}

function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) {
    return false;
  }

  try {
    return origin === new URL(origin).origin && new URL(request.url).origin === origin;
  } catch {
    return false;
  }
}

async function checkLoginRateLimit(binding: RateLimit, scope: string, value: string): Promise<boolean> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(`${scope}:${value}`));
  const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");

  try {
    const outcome = await binding.limit({ key });
    return outcome.success;
  } catch {
    throw new LoginRateLimitUnavailableError();
  }
}

function rateLimitUnavailable(c: Context<AuthEnv>) {
  return c.json({ error: "Login temporarily unavailable" }, 503);
}

function loginRateLimited(c: Context<AuthEnv>) {
  return c.json({ error: "Invalid username or password" }, 429);
}

function createSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createId(): string {
  return crypto.randomUUID();
}

function userIdentity(user: AuthenticatedUser): AuthenticatedUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    mustChangePassword: user.mustChangePassword,
    teacher: user.teacher,
  };
}

function setNoStore(c: Context<AuthEnv>): void {
  c.header("Cache-Control", "no-store");
  c.header("Pragma", "no-cache");
}

const auth = new Hono<AuthEnv>();

auth.use("*", async (c, next) => {
  setNoStore(c);
  await next();
});

auth.post("/login", async (c) => {
  if (!hasSameOrigin(c.req.raw)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const sourceIp = c.req.raw.headers.get("CF-Connecting-IP")?.trim() || "unknown";
  try {
    if (!(await checkLoginRateLimit(c.env.LOGIN_IP_RATE_LIMITER, "ip", sourceIp))) {
      return loginRateLimited(c);
    }
  } catch (error) {
    if (error instanceof LoginRateLimitUnavailableError) {
      return rateLimitUnavailable(c);
    }
    throw error;
  }

  const body = await readJsonObject(c.req.raw);
  const username = body && normalizedUsername(body.username);
  if (!username) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  try {
    if (
      !(await checkLoginRateLimit(
        c.env.LOGIN_USERNAME_RATE_LIMITER,
        "username",
        username.toLowerCase(),
      ))
    ) {
      return loginRateLimited(c);
    }
  } catch (error) {
    if (error instanceof LoginRateLimitUnavailableError) {
      return rateLimitUnavailable(c);
    }
    throw error;
  }

  const password = body && isPassword(body.password) ? body.password : null;
  if (!password) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const user = await c.env.DB.prepare(
    `SELECT
       u.id,
       u.username,
       u.password_hash,
       u.role,
       u.is_active,
       u.must_change_password,
       u.failed_login_attempts,
       u.locked_until,
       g.id AS teacher_id,
       g.kode AS teacher_code,
       g.nama AS teacher_name
     FROM users u
     LEFT JOIN teacher_auth ta ON ta.user_id = u.id AND u.role = 'TEACHER'
     LEFT JOIN guru g ON g.id = ta.guru_id
     WHERE u.username = ? COLLATE NOCASE
     LIMIT 1`,
  )
    .bind(username)
    .first<LoginUserRow>();

  const now = Date.now();
  const lockedUntil = user?.locked_until ? Date.parse(user.locked_until) : null;
  const isLocked = Boolean(
    user &&
      user.locked_until !== null &&
      (lockedUntil === null || !Number.isFinite(lockedUntil) || lockedUntil > now),
  );
  if (!user || user.is_active !== 1 || isLocked) {
    await hashPassword(password);
    return c.json({ error: "Invalid username or password" }, 401);
  }

  if (!(await verifyPassword(password, user.password_hash))) {
    const failureTime = new Date(now).toISOString();
    const lockUntil = new Date(now + LOCKOUT_MS).toISOString();
    await c.env.DB.prepare(
      `UPDATE users
       SET failed_login_attempts = failed_login_attempts + 1,
           locked_until = CASE
             WHEN failed_login_attempts + 1 >= ? THEN ?
             ELSE locked_until
           END,
           updated_at = ?
       WHERE id = ?
         AND is_active = 1
         AND (locked_until IS NULL OR julianday(locked_until) <= julianday(?))`,
    )
      .bind(FAILED_LOGIN_LIMIT, lockUntil, failureTime, user.id, failureTime)
      .run();

    return c.json({ error: "Invalid username or password" }, 401);
  }

  const loginTime = new Date(now).toISOString();
  const absoluteExpiry = new Date(now + SESSION_ABSOLUTE_MS).toISOString();
  const idleExpiry = new Date(Math.min(now + SESSION_IDLE_MS, now + SESSION_ABSOLUTE_MS)).toISOString();
  const token = createSessionToken();
  const tokenHash = await hashSessionToken(token);
  const sessionId = createId();

  const accountStatePredicate = `id = ?
    AND password_hash = ?
    AND is_active = 1
    AND failed_login_attempts = ?
    AND (locked_until IS NULL OR julianday(locked_until) <= julianday(?))`;
  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at, last_activity_at, created_at)
       SELECT ?, id, ?, ?, ?, ?
       FROM users
       WHERE ${accountStatePredicate}`,
    ).bind(
      sessionId,
      tokenHash,
      idleExpiry,
      loginTime,
      loginTime,
      user.id,
      user.password_hash,
      user.failed_login_attempts,
      loginTime,
    ),
    c.env.DB.prepare(
      `UPDATE users
       SET failed_login_attempts = 0,
           locked_until = NULL,
           last_login_at = ?,
           updated_at = ?
       WHERE ${accountStatePredicate}`,
    ).bind(loginTime, loginTime, user.id, user.password_hash, user.failed_login_attempts, loginTime),
  ]);

  if (results[0].meta.changes !== 1 || results[1].meta.changes !== 1) {
    await c.env.DB.prepare(
      "UPDATE sessions SET revoked_at = ? WHERE id = ? AND token_hash = ? AND revoked_at IS NULL",
    )
      .bind(loginTime, sessionId, tokenHash)
      .run();
    return c.json({ error: "Invalid username or password" }, 401);
  }

  setSessionCookie(c, token, idleExpiry, now);
  return c.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      mustChangePassword: user.must_change_password === 1,
      teacher:
        user.teacher_id !== null && user.teacher_code !== null && user.teacher_name !== null
          ? { id: user.teacher_id, code: user.teacher_code, name: user.teacher_name }
          : null,
    },
  });
});

auth.post("/logout", async (c) => {
  if (!hasSameOrigin(c.req.raw)) {
    clearSessionCookie(c);
    return c.json({ error: "Forbidden" }, 403);
  }

  clearSessionCookie(c);
  const token = getCookie(c, SESSION_COOKIE);
  if (token && isValidSessionToken(token)) {
    const tokenHash = await hashSessionToken(token);
    await c.env.DB.prepare(
      "UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL",
    )
      .bind(new Date().toISOString(), tokenHash)
      .run();
  }

  return c.json({ success: true });
});

auth.get("/me", (c) => {
  return c.json({ user: userIdentity(c.get("authUser")) });
});

auth.post("/change-password", async (c) => {
  if (!hasSameOrigin(c.req.raw)) {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await readJsonObject(c.req.raw);
  const currentPassword = body && isPassword(body.currentPassword) ? body.currentPassword : null;
  const newPassword = body && isPassword(body.newPassword) ? body.newPassword : null;
  if (!currentPassword || !newPassword) {
    return c.json({ error: "Invalid request body" }, 400);
  }

  const user = c.get("authUser");
  const currentSessionId = c.get("sessionId");
  const currentAccount = await c.env.DB.prepare(
    "SELECT password_hash FROM users WHERE id = ? AND is_active = 1",
  )
    .bind(user.id)
    .first<{ password_hash: string }>();

  if (!currentAccount || !(await verifyPassword(currentPassword, currentAccount.password_hash))) {
    return c.json({ error: "Current password is incorrect" }, 401);
  }

  const newPasswordHash = await hashPassword(newPassword);
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const nextExpiry = new Date(now + SESSION_IDLE_MS).toISOString();
  const nextToken = createSessionToken();
  const nextTokenHash = await hashSessionToken(nextToken);
  const nextSessionId = createId();

  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE users
       SET password_hash = ?,
           must_change_password = 0,
           updated_at = ?
       WHERE id = ?
         AND password_hash = ?
         AND is_active = 1
         AND EXISTS (
           SELECT 1 FROM sessions
           WHERE id = ? AND user_id = users.id
             AND revoked_at IS NULL
             AND julianday(expires_at) > julianday(?)
         )`,
    ).bind(
      newPasswordHash,
      nowIso,
      user.id,
      currentAccount.password_hash,
      currentSessionId,
      nowIso,
    ),
    c.env.DB.prepare(
      `UPDATE sessions
       SET revoked_at = ?
       WHERE user_id = ?
         AND revoked_at IS NULL
         AND EXISTS (
           SELECT 1 FROM users
           WHERE users.id = sessions.user_id
             AND users.password_hash = ?
             AND users.is_active = 1
         )`,
    ).bind(nowIso, user.id, newPasswordHash),
    c.env.DB.prepare(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at, last_activity_at, created_at)
       SELECT ?, id, ?, ?, ?, ?
       FROM users
       WHERE id = ?
         AND password_hash = ?
         AND is_active = 1
         AND must_change_password = 0`,
    ).bind(nextSessionId, nextTokenHash, nextExpiry, nowIso, nowIso, user.id, newPasswordHash),
  ]);

  if (results[0].meta.changes !== 1 || results[2].meta.changes !== 1) {
    return c.json({ error: "Authentication required" }, 401);
  }

  setSessionCookie(c, nextToken, nextExpiry, now);
  return c.json({
    user: {
      ...userIdentity(user),
      mustChangePassword: false,
    },
  });
});

export default auth;
