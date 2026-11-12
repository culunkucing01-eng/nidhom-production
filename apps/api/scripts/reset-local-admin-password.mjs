/**
 * reset-local-admin-password.mjs
 *
 * Menyemai (seed) / mereset kredensial admin default pada D1 LOKAL saja.
 * Kredensial default:  username "Admin"  |  password "dalwa2026"
 *
 * PENTING:
 * - Hanya menyentuh D1 lokal terisolasi (wrangler.local.jsonc, tanpa database_id).
 *   Menolak berjalan bila konfigurasi tidak terisolasi (pagar keselamatan).
 * - Password disimpan sebagai hash PBKDF2 dengan format yang IDENTIK dengan
 *   src/lib/password.ts (v1$pbkdf2$sha256$600000$<saltB64Url>$<hashB64Url>).
 *   Plaintext password tidak pernah ditulis ke DB.
 * - Password dapat dioverride lewat env NIDHOM_ADMIN_PASSWORD.
 *
 * Pakai:
 *   node scripts/reset-local-admin-password.mjs              # seed/reset admin lokal
 *   node scripts/reset-local-admin-password.mjs --self-test   # uji konsistensi hash
 */
import { execFileSync } from "node:child_process";
import { randomUUID, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const apiRoot = resolve(__dirname, "..");

const ADMIN_USERNAME = "Admin";
const DEFAULT_ADMIN_PASSWORD = "dalwa2026";
const ADMIN_PASSWORD = process.env.NIDHOM_ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;

// --- Parameter hash: HARUS identik dengan src/lib/password.ts ---
const HASH_VERSION = "v1";
const HASH_ALGORITHM = "pbkdf2";
const HASH_DIGEST = "sha256";
const ITERATIONS = 600_000;
const SALT_LENGTH = 16;
const HASH_LENGTH = 32;

function base64Url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

function decodeBase64Url(value) {
  return new Uint8Array(Buffer.from(value, "base64url"));
}

async function deriveBits(password, salt) {
  const key = await webcrypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await webcrypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: ITERATIONS },
    key,
    HASH_LENGTH * 8,
  );
  return new Uint8Array(bits);
}

async function hashPassword(password) {
  const salt = webcrypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const hash = await deriveBits(password, salt);
  return [
    HASH_VERSION,
    HASH_ALGORITHM,
    HASH_DIGEST,
    String(ITERATIONS),
    base64Url(salt),
    base64Url(hash),
  ].join("$");
}

async function verifyPassword(password, storedHash) {
  try {
    const parts = String(storedHash).split("$");
    if (
      parts.length !== 6 ||
      parts[0] !== HASH_VERSION ||
      parts[1] !== HASH_ALGORITHM ||
      parts[2] !== HASH_DIGEST ||
      parts[3] !== String(ITERATIONS)
    ) {
      return false;
    }
    const salt = decodeBase64Url(parts[4]);
    const expected = decodeBase64Url(parts[5]);
    if (salt.length !== SALT_LENGTH || expected.length !== HASH_LENGTH) {
      return false;
    }
    const actual = await deriveBits(password, salt);
    if (actual.length !== expected.length) return false;
    let diff = 0;
    for (let i = 0; i < actual.length; i += 1) diff |= actual[i] ^ expected[i];
    return diff === 0;
  } catch {
    return false;
  }
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function loadIsolatedLocalDatabase() {
  const configPath = resolve(apiRoot, "wrangler.local.jsonc");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const database = config.d1_databases?.find((entry) => entry.binding === "DB");
  if (
    config.main !== "src/local.ts" ||
    !database?.database_name ||
    "database_id" in database
  ) {
    throw new Error(
      "Ditolak: wrangler.local.jsonc bukan konfigurasi D1 lokal yang terisolasi.",
    );
  }
  return database.database_name;
}

function wranglerArgs(databaseName, args) {
  const wranglerPath = resolve(apiRoot, "node_modules/wrangler/bin/wrangler.js");
  return [
    wranglerPath,
    "d1",
    ...args,
    databaseName,
    "--local",
    "--config",
    "wrangler.local.jsonc",
  ];
}

function applyLocalMigrations(databaseName) {
  execFileSync(
    process.execPath,
    wranglerArgs(databaseName, ["migrations", "apply"]),
    { cwd: apiRoot, stdio: "ignore" },
  );
}

function runLocalD1(databaseName, sql, { json = false } = {}) {
  const args = wranglerArgs(databaseName, ["execute"]);
  if (json) args.push("--json");
  args.push("--command", sql);
  return execFileSync(process.execPath, args, {
    cwd: apiRoot,
    encoding: "utf8",
    stdio: json ? ["ignore", "pipe", "ignore"] : ["ignore", "ignore", "ignore"],
  });
}

async function selfTest() {
  const hash = await hashPassword(ADMIN_PASSWORD);
  const ok = await verifyPassword(ADMIN_PASSWORD, hash);
  const wrong = await verifyPassword("kata-sandi-salah", hash);
  if (!ok || wrong) {
    console.error("FAIL: hashPassword/verifyPassword tidak konsisten.");
    process.exitCode = 1;
    return;
  }
  console.log("PASS: hash/verify konsisten dengan format v1$pbkdf2$sha256$600000$...");
}

async function seed() {
  const databaseName = loadIsolatedLocalDatabase();
  applyLocalMigrations(databaseName);

  const hash = await hashPassword(ADMIN_PASSWORD);
  const now = new Date().toISOString();
  const id = randomUUID();

  // Upsert idempoten. username UNIQUE COLLATE NOCASE -> konflik memperbarui baris.
  const upsertSql = `
    INSERT INTO users (id, username, password_hash, role, is_active, must_change_password, failed_login_attempts, locked_until, created_at, updated_at)
    VALUES (${sqlLiteral(id)}, ${sqlLiteral(ADMIN_USERNAME)}, ${sqlLiteral(hash)}, 'ADMIN', 1, 0, 0, NULL, ${sqlLiteral(now)}, ${sqlLiteral(now)})
    ON CONFLICT(username) DO UPDATE SET
      password_hash = excluded.password_hash,
      role = 'ADMIN',
      is_active = 1,
      must_change_password = 0,
      failed_login_attempts = 0,
      locked_until = NULL,
      updated_at = excluded.updated_at;
  `;
  runLocalD1(databaseName, upsertSql);

  const verifySql = `SELECT id, username, role, is_active, must_change_password, password_hash FROM users WHERE username = ${sqlLiteral(ADMIN_USERNAME)} COLLATE NOCASE LIMIT 1;`;
  const out = runLocalD1(databaseName, verifySql, { json: true });
  const rows = JSON.parse(out)?.[0]?.results ?? [];
  const row = rows[0];
  if (!row) {
    console.error("FAIL: admin tidak ditemukan setelah seed.");
    process.exitCode = 1;
    return;
  }
  if (!(await verifyPassword(ADMIN_PASSWORD, row.password_hash))) {
    console.error("FAIL: hash tersimpan tidak cocok dengan password default.");
    process.exitCode = 1;
    return;
  }
  console.log(
    `PASS: admin lokal '${row.username}' siap (role=${row.role}, active=${row.is_active}, must_change_password=${row.must_change_password}).`,
  );
  console.log("Login melalui frontend dev server dengan:");
  console.log(`  Nama pengguna : ${ADMIN_USERNAME}`);
  console.log(
    `  Kata sandi    : ${ADMIN_PASSWORD === DEFAULT_ADMIN_PASSWORD ? ADMIN_PASSWORD : "(diambil dari NIDHOM_ADMIN_PASSWORD)"}`,
  );
}

const isSelfTest = process.argv.includes("--self-test");
try {
  if (isSelfTest) {
    await selfTest();
  } else {
    await seed();
  }
} catch (error) {
  console.error(`Gagal: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
