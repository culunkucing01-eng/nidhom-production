import { getCookie, setCookie } from "hono/cookie";
import type { MiddlewareHandler } from "hono";

const SESSION_COOKIE = "nidhom_session";
const SESSION_IDLE_MS = 8 * 60 * 60 * 1000;
const SESSION_ABSOLUTE_MS = 24 * 60 * 60 * 1000;

export type UserRole = "ADMIN" | "LEADERSHIP" | "TEACHER";

export interface AuthenticatedUser {
  id: string;
  username: string;
  role: UserRole;
  mustChangePassword: boolean;
  teacher: {
    id: string;
    code: string;
    name: string;
  } | null;
}

export interface AuthEnv {
  Bindings: CloudflareBindings;
  Variables: {
    authUser: AuthenticatedUser;
    sessionId: string;
  };
}

interface SessionUserRow {
  session_id: string;
  session_created_at: string;
  session_expires_at: string;
  user_id: string;
  username: string;
  role: UserRole;
  is_active: number;
  must_change_password: number;
  teacher_id: string | null;
  teacher_code: string | null;
  teacher_name: string | null;
}

const encoder = new TextEncoder();

export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isValidSessionToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function setSessionCookie(
  c: Parameters<MiddlewareHandler<AuthEnv>>[0],
  token: string,
  expiresAt: string,
  now: number,
): void {
  const maxAge = Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000));
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge,
  });
}

export function clearSessionCookie(c: Parameters<MiddlewareHandler<AuthEnv>>[0]): void {
  setCookie(c, SESSION_COOKIE, "", {
    httpOnly: true,
    secure: true,
    sameSite: "Lax",
    path: "/",
    maxAge: 0,
  });
}

export const authMiddleware: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token || !isValidSessionToken(token)) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const tokenHash = await hashSessionToken(token);
  const row = await c.env.DB.prepare(
    `SELECT
       s.id AS session_id,
       s.created_at AS session_created_at,
       s.expires_at AS session_expires_at,
       u.id AS user_id,
       u.username,
       u.role,
       u.is_active,
       u.must_change_password,
       g.id AS teacher_id,
       g.kode AS teacher_code,
       g.nama AS teacher_name
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     LEFT JOIN teacher_auth ta ON ta.user_id = u.id AND u.role = 'TEACHER'
     LEFT JOIN guru g ON g.id = ta.guru_id
     WHERE s.token_hash = ? AND s.revoked_at IS NULL
     LIMIT 1`,
  )
    .bind(tokenHash)
    .first<SessionUserRow>();

  const now = Date.now();
  if (!row || row.is_active !== 1) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const createdAt = Date.parse(row.session_created_at);
  const expiresAt = Date.parse(row.session_expires_at);
  const absoluteExpiry = createdAt + SESSION_ABSOLUTE_MS;
  if (
    !Number.isFinite(createdAt) ||
    !Number.isFinite(expiresAt) ||
    createdAt > now ||
    expiresAt <= now ||
    absoluteExpiry <= now
  ) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const nextExpiry = new Date(Math.min(now + SESSION_IDLE_MS, absoluteExpiry)).toISOString();
  const nowIso = new Date(now).toISOString();
  const activityUpdate = await c.env.DB.prepare(
    `UPDATE sessions
     SET expires_at = CASE
           WHEN julianday(expires_at) > julianday(?)
             THEN CASE
               WHEN julianday(expires_at) < julianday(?) THEN expires_at
               ELSE ?
             END
           ELSE ?
         END,
         last_activity_at = CASE
           WHEN julianday(last_activity_at) > julianday(?) THEN last_activity_at
           ELSE ?
         END
     WHERE id = ?
       AND token_hash = ?
       AND revoked_at IS NULL
       AND julianday(expires_at) > julianday(?)
       AND created_at = ?
       AND EXISTS (
         SELECT 1 FROM users
         WHERE users.id = sessions.user_id AND users.is_active = 1
       )`,
  )
    .bind(
      nextExpiry,
      new Date(absoluteExpiry).toISOString(),
      new Date(absoluteExpiry).toISOString(),
      nextExpiry,
      nowIso,
      nowIso,
      row.session_id,
      tokenHash,
      nowIso,
      row.session_created_at,
    )
    .run();

  if (activityUpdate.meta.changes !== 1) {
    return c.json({ error: "Authentication required" }, 401);
  }

  c.set("authUser", {
    id: row.user_id,
    username: row.username,
    role: row.role,
    mustChangePassword: row.must_change_password === 1,
    teacher:
      row.teacher_id !== null && row.teacher_code !== null && row.teacher_name !== null
        ? { id: row.teacher_id, code: row.teacher_code, name: row.teacher_name }
        : null,
  });
  c.set("sessionId", row.session_id);
  setSessionCookie(c, token, nextExpiry, now);
  await next();
};

export const applicationAuthMiddleware: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const path = c.req.path;
  const method = c.req.method;

  if (method === "POST" && (path === "/auth/login" || path === "/auth/logout")) {
    await next();
    return;
  }

  let passwordChangeRequired = false;
  const authResponse = await authMiddleware(c, async () => {
    const user = c.get("authUser");
    const isAllowedDuringPasswordChange =
      (method === "GET" && path === "/auth/me") ||
      (method === "POST" && path === "/auth/change-password");

    if (user.mustChangePassword && !isAllowedDuringPasswordChange) {
      passwordChangeRequired = true;
      return;
    }

    await next();
  });

  if (authResponse) {
    return authResponse;
  }

  if (passwordChangeRequired) {
    return c.json({ error: "Password change required" }, 403);
  }
};

export function requireRole(...allowedRoles: UserRole[]): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const user = c.get("authUser");
    if (!user) {
      return c.json({ error: "Authentication required" }, 401);
    }

    if (!allowedRoles.includes(user.role)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    await next();
  };
}
