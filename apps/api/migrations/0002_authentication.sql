
-- =========================================================
-- NIDHOM
-- Migration 0002: Authentication & User Management
-- =========================================================

-- 1. USERS
CREATE TABLE users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL COLLATE NOCASE UNIQUE
    CHECK (length(trim(username)) > 0),
    password_hash TEXT NOT NULL,

    role TEXT NOT NULL
        CHECK (role IN ('ADMIN', 'LEADERSHIP', 'TEACHER')),

    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1)),

    must_change_password INTEGER NOT NULL DEFAULT 1
        CHECK (must_change_password IN (0, 1)),

    failed_login_attempts INTEGER NOT NULL DEFAULT 0
    CHECK (failed_login_attempts >= 0),
    locked_until TEXT,
    last_login_at TEXT,

    created_by TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (created_by)
        REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_active ON users(is_active);

-- 2. TEACHER AUTH
CREATE TABLE teacher_auth (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    guru_id TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE RESTRICT,

    FOREIGN KEY (guru_id)
        REFERENCES guru(id) ON DELETE RESTRICT
);

-- 3. SESSIONS
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,

    token_hash TEXT NOT NULL UNIQUE
    CHECK (length(token_hash) >= 64),

    expires_at TEXT NOT NULL,
    last_activity_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_sessions_user
ON sessions(user_id);

CREATE INDEX idx_sessions_expiry
ON sessions(expires_at);

CREATE INDEX idx_sessions_active
ON sessions(user_id, revoked_at, expires_at);

-- 4. AUDIT LOGS
CREATE TABLE audit_logs (
    id TEXT PRIMARY KEY,

    actor_user_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT,

    before_json TEXT,
    after_json TEXT,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (actor_user_id)
        REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_audit_actor
ON audit_logs(actor_user_id);

CREATE INDEX idx_audit_entity
ON audit_logs(entity_type, entity_id);

CREATE INDEX idx_audit_created
ON audit_logs(created_at);
