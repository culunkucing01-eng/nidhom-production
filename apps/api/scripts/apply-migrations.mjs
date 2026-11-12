// apply-migrations.mjs
// Gated migration runner untuk D1 PRODUKSI (remote) saja.
//
// Pagar keselamatan (.clinerules):
//   - Tidak menulis ke produksi tanpa persetujuan EKSPLISIT (butuh attestasi operator).
//   - Hanya menyentuh konfigurasi PRODUKSI (wrangler.jsonc) + target --remote.
//     Konfigurasi lokal (wrangler.local.jsonc / nidhom-api-local) ditolak.
//   - Tidak mengarang database_id/namespace; semua dibaca dari wrangler.jsonc.
//   - Read-only sampai semua gerbang lolos; perintah wrangler dibuat TETAP.
//
// Pemakaian:
//   node scripts/apply-migrations.mjs --dry-run                         # pratinjau (tanpa perubahan)
//   NIDHOM_D1_MIGRATE_PROD=I_CONFIRM_D1_MIGRATION \
//     node scripts/apply-migrations.mjs                                 # terapkan ke produksi

import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWranglerConfig } from "./validate-production-config.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const API_DIR = resolve(HERE, "..");
const WRANGLER_CONFIG = process.env.NIDHOM_WRANGLER_CONFIG
  ? resolve(process.env.NIDHOM_WRANGLER_CONFIG)
  : resolve(API_DIR, "wrangler.jsonc");
const WRANGLER_BIN = resolve(API_DIR, "node_modules/wrangler/bin/wrangler.js");
const EXPECTED_DB_BINDING = "DB";
const LOCAL_WORKER_NAME = "nidhom-api-local";
const ATTESTATION_KEY = "NIDHOM_D1_MIGRATE_PROD";
const ATTESTATION_VALUE = "I_CONFIRM_D1_MIGRATION";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIGRATION_RE = /^\d+_[A-Za-z0-9._-]+\.sql$/;

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const unknownArgs = args.filter((arg) => arg !== "--dry-run");
if (unknownArgs.length > 0) {
  console.log(`⚠️  Argumen diabaikan (perintah migrasi dibuat tetap demi keamanan): ${unknownArgs.join(" ")}`);
}

function fail(message) {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

// ── Gerbang 0: wrangler terpasang ────────────────────────────────────────────
if (!existsSync(WRANGLER_BIN)) {
  fail("Wrangler belum terpasang. Jalankan 'npm install' terlebih dahulu.");
}

// ── Gerbang 1: konfigurasi PRODUKSI ada & dapat dibaca ───────────────────────
if (!existsSync(WRANGLER_CONFIG)) {
  fail(`Berkas ${WRANGLER_CONFIG} tidak ditemukan. Migrasi hanya untuk produksi (wrangler.jsonc), bukan wrangler.local.jsonc.`);
}

let config;
try {
  config = loadWranglerConfig(WRANGLER_CONFIG);
} catch (error) {
  fail(error.message);
}

// ── Gerbang 2: target D1 produksi siap ───────────────────────────────────────
if (config.name === LOCAL_WORKER_NAME) {
  fail(`Konfigurasi ini adalah LOKAL (${LOCAL_WORKER_NAME}). Migrasi D1 hanya untuk produksi.`);
}
const d1List = Array.isArray(config.d1_databases) ? config.d1_databases : [];
const db = d1List.find((entry) => entry && entry.binding === EXPECTED_DB_BINDING);
if (!db) fail(`Binding D1 "${EXPECTED_DB_BINDING}" tidak ditemukan di wrangler.jsonc.`);
if (typeof db.database_name !== "string" || !db.database_name.trim()) {
  fail("database_name D1 tidak valid di wrangler.jsonc.");
}
if (typeof db.database_id !== "string" || !UUID_RE.test(db.database_id)) {
  fail("database_id D1 produksi tidak valid (harus UUID). Konfigurasi lokal tidak boleh dimigrasi.");
}
if (typeof db.migrations_dir !== "string" || !db.migrations_dir.trim()) {
  fail("migrations_dir tidak diatur di wrangler.jsonc.");
}

// ── Gerbang 3: file migrasi lokal siap ───────────────────────────────────────
const migrationsPath = resolve(API_DIR, db.migrations_dir);
if (!existsSync(migrationsPath)) {
  fail(`Direktori migrasi tidak ditemukan: ${migrationsPath}`);
}
let entries;
try {
  entries = readdirSync(migrationsPath);
} catch (error) {
  fail(`Gagal membaca direktori migrasi ${migrationsPath}: ${error.message}`);
}
const migrations = entries.filter((name) => MIGRATION_RE.test(name)).sort();
const stray = entries.filter((name) => name.toLowerCase().endsWith(".sql") && !MIGRATION_RE.test(name));
if (migrations.length === 0) {
  fail(`Tidak ada file migrasi (.sql) di ${migrationsPath}.`);
}
for (const name of stray) {
  console.log(`⚠️  File .sql tidak dikenali (diabaikan): ${name}`);
}

// ── Ringkasan rencana ────────────────────────────────────────────────────────
console.log("\n=== Rencana migrasi D1 (PRODUKSI / remote) ===");
console.log(`Config      : ${WRANGLER_CONFIG}`);
console.log(`Binding     : ${EXPECTED_DB_BINDING}`);
console.log(`Database    : ${db.database_name}`);
console.log(`Database ID : ${db.database_id}`);
console.log(`Migrations  : ${migrations.length} file di ${db.migrations_dir}`);
for (const name of migrations) console.log(`   - ${name}`);
console.log("Catatan: wrangler hanya menerapkan migrasi yang BELUM tercatat; aman dijalankan ulang.");

// ── Mode dry-run: berhenti sebelum menyentuh apa pun ─────────────────────────
if (dryRun) {
  console.log("\n✅ Mode --dry-run: semua pemeriksaan lolos. TIDAK ada migrasi yang diterapkan.");
  process.exit(0);
}

// ── Gerbang 4: attestasi operator (persetujuan eksplisit) ────────────────────
if (process.env[ATTESTATION_KEY] !== ATTESTATION_VALUE) {
  console.error("\n❌ Attestasi operator belum diberikan. Migrasi DIBATALKAN.");
  console.error(`   Set environment variable: ${ATTESTATION_KEY}=${ATTESTATION_VALUE}`);
  console.error("   Lakukan HANYA jika yakin menerapkan migrasi ke database PRODUKSI di atas.");
  console.error("   Tip: jalankan dengan --dry-run untuk pratinjau tanpa perubahan.");
  process.exit(1);
}

// ── Jalankan wrangler (remote/produksi); perintah dibuat tetap ───────────────
console.log("\n⚠️  Menerapkan migrasi ke D1 PRODUKSI (remote)...\n");
const child = spawn(
  process.execPath,
  [WRANGLER_BIN, "d1", "migrations", "apply", db.database_name, "--remote", "--config", WRANGLER_CONFIG],
  { stdio: "inherit", cwd: API_DIR },
);

child.on("error", (error) => {
  console.error(`\n❌ Gagal menjalankan wrangler: ${error.message}`);
  process.exit(1);
});

child.on("close", (code) => {
  if (code === 0) {
    console.log("\n✅ Migrasi D1 selesai diterapkan.");
  } else {
    console.error(`\n❌ Wrangler keluar dengan kode ${code}. Migrasi gagal/dibatalkan.`);
  }
  process.exit(code ?? 1);
});
