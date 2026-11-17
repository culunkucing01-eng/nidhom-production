// seed-admin.mjs
// Membuat akun admin awal di D1 PRODUKSI (remote).
// Menggunakan algoritma hash yang identik dengan hashPassword di lib/password.ts
// agar verifikasi login berjalan normal.
//
// Pemakaian:
//   NIDHOM_D1_SEED_ADMIN=I_CONFIRM_SEED_ADMIN node scripts/seed-admin.mjs

import { spawn } from "node:child_process";
import { randomBytes, pbkdf2Sync } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWranglerConfig } from "./validate-production-config.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const API_DIR = resolve(HERE, "..");
const WRANGLER_CONFIG = resolve(API_DIR, "wrangler.jsonc");
const WRANGLER_BIN = resolve(API_DIR, "node_modules/wrangler/bin/wrangler.js");

const HASH_VERSION = "v1";
const HASH_ALGORITHM = "pbkdf2";
const HASH_DIGEST = "sha256";
const ITERATIONS = 100000;
const SALT_LENGTH = 16;
const HASH_LENGTH = 32;

function encodeBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function hashPassword(password) {
  const salt = randomBytes(SALT_LENGTH);
  const hash = pbkdf2Sync(password, salt, ITERATIONS, HASH_LENGTH, "sha256");
  return [
    HASH_VERSION,
    HASH_ALGORITHM,
    HASH_DIGEST,
    String(ITERATIONS),
    encodeBase64Url(salt),
    encodeBase64Url(hash),
  ].join("$");
}

function normalizeUsername(value) {
  const username = value.trim();
  if (username.length === 0 || /[\u0000-\u001f\u007f]/.test(username)) {
    throw new Error("Username admin tidak valid.");
  }
  return username;
}

function fail(message) {
  console.error("\n❌ " + message);
  process.exit(1);
}

if (!existsSync(WRANGLER_BIN)) {
  fail("Wrangler belum terpasang. Jalankan 'npm install' terlebih dahulu.");
}

if (!existsSync(WRANGLER_CONFIG)) {
  fail("Berkas " + WRANGLER_CONFIG + " tidak ditemukan.");
}

let config;
try {
  config = loadWranglerConfig(WRANGLER_CONFIG);
} catch (error) {
  fail(error.message);
}

if (config.name === "nidhom-api-local") {
  fail("Konfigurasi ini adalah LOKAL. Seed hanya untuk produksi.");
}

const db = config.d1_databases?.find((e) => e && e.binding === "DB");
if (!db) fail("Binding D1 DB tidak ditemukan di wrangler.jsonc.");

if (process.env.NIDHOM_D1_SEED_ADMIN !== "I_CONFIRM_SEED_ADMIN") {
  console.error("\n❌ Attestasi operator belum diberikan. Seed DIBATALKAN.");
  console.error("   Set environment variable: NIDHOM_D1_SEED_ADMIN=I_CONFIRM_SEED_ADMIN");
  console.error("   Lakukan HANYA jika yakin membuat akun admin di database PRODUKSI.");
  process.exit(1);
}

const username = normalizeUsername("Admin");
const password = "dalwa2026";
const role = "ADMIN";
const userId = crypto.randomUUID();
const now = new Date().toISOString();
const passwordHash = hashPassword(password);

console.log("\n=== Seed Admin Produksi ===");
console.log("Database  : " + db.database_name);
console.log("Username  : " + username);
console.log("Role      : " + role);
console.log("User ID   : " + userId);
console.log("Password  : " + password);
console.log("Hash      : " + passwordHash);

console.log("\nMemeriksa apakah user sudah ada...");
const checkChild = spawn(
  process.execPath,
  [WRANGLER_BIN, "d1", "execute", db.database_name, "--remote", "--config", WRANGLER_CONFIG, "--yes", "--json", "--command", "SELECT id FROM users WHERE username = '" + username + "' LIMIT 1"],
  { stdio: ["pipe", "pipe", "pipe"], cwd: API_DIR },
);

let checkOutput = "";
let checkError = "";
checkChild.stdout.on("data", function(d) { checkOutput += d; });
checkChild.stderr.on("data", function(d) { checkError += d; });

const checkExitCode = await new Promise(function(resolve) { checkChild.on("close", resolve); });

if (checkExitCode !== 0) {
  fail("Gagal memeriksa user yang sudah ada di D1 produksi: " + checkError.trim());
}

let existingUser = null;
try {
  var parsed = JSON.parse(checkOutput);
  var results = parsed && parsed[0] ? parsed[0].results : [];
  if (results.length > 0) existingUser = results[0];
} catch (e) {
  fail("Gagal mem-parsing respons pemeriksaan user: " + e.message);
}

var safeHash = passwordHash.replace(/'/g, "''");
var safeUsername = username.replace(/'/g, "''");
var sql;
if (existingUser) {
  console.log("\nUser '" + username + "' sudah ada (id: " + existingUser.id + "). Memperbarui hash dan mereset status login...");
  sql = "UPDATE users SET username = '" + safeUsername + "', password_hash = '" + safeHash + "', role = '" + role + "', is_active = 1, must_change_password = 0, failed_login_attempts = 0, locked_until = NULL, last_login_at = NULL, updated_at = '" + now + "' WHERE id = '" + existingUser.id.replace(/'/g, "''") + "'";
} else {
  console.log("\nMenginsert user admin ke tabel users...");
  sql = "INSERT INTO users (id, username, password_hash, role, is_active, must_change_password, failed_login_attempts, locked_until, last_login_at, created_by, created_at, updated_at) VALUES ('" + userId + "', '" + safeUsername + "', '" + safeHash + "', '" + role + "', 1, 0, 0, NULL, NULL, NULL, '" + now + "', '" + now + "')";
}

const insertChild = spawn(
  process.execPath,
  [WRANGLER_BIN, "d1", "execute", db.database_name, "--remote", "--config", WRANGLER_CONFIG, "--yes", "--json", "--command", sql],
  { stdio: ["pipe", "pipe", "pipe"], cwd: API_DIR },
);

let insertOutput = "";
let insertError = "";
insertChild.stdout.on("data", function(d) { insertOutput += d; });
insertChild.stderr.on("data", function(d) { insertError += d; });

const insertExitCode = await new Promise(function(resolve) { insertChild.on("close", resolve); });

if (insertExitCode !== 0) {
  fail("Insert gagal: " + insertError.trim());
}

try {
  var parsed2 = JSON.parse(insertOutput);
  if (parsed2 && parsed2[0] && parsed2[0].success) {
    console.log("\n✅ Akun admin berhasil disinkronkan!");
    console.log("   Username: " + username);
    console.log("   Password: " + password);
    console.log("   Role: " + role);
    console.log("\nAnda sekarang dapat login di https://nidhom-production.vercel.app");
  } else {
    fail("Insert gagal: " + JSON.stringify(parsed2));
  }
} catch (error) {
  fail("Gagal mem-parsing respons insert: " + error.message + "\nOutput: " + insertOutput);
}