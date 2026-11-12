// deploy.mjs — helper deploy AMAN untuk nidhom-api ke Cloudflare.
//
// Semua gerbang berikut harus lolos SEBELUM wrangler dijalankan:
//   1. wrangler.jsonc produksi ada dan lolos validasi read-only.
//   2. Attestasi operator diset (membuktikan namespace_id rate-limit sudah diverifikasi).
//   3. Wrangler terpasang secara lokal.
//
// RUANG LINGKUP: men-deploy KODE Worker saja. Skrip ini TIDAK pernah menjalankan
// migrasi D1 atau menulis data produksi — itu langkah terpisah yang memerlukan
// persetujuan eksplisit (lihat .clinerules).

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateProductionConfig } from "./validate-production-config.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const API_DIR = resolve(HERE, "..");
const WRANGLER_CONFIG = resolve(API_DIR, "wrangler.jsonc");
const WRANGLER_BIN = resolve(API_DIR, "node_modules/wrangler/bin/wrangler.js");
const ATTESTATION_KEY = "NIDHOM_RATE_LIMIT_IDS_VERIFIED";
const ATTESTATION_VALUE = "I_VERIFIED_THESE_IN_CLOUDFLARE";

function fail(message) {
  console.error(`\n❌ ${message}`);
  process.exit(1);
}

if (!existsSync(WRANGLER_CONFIG)) {
  fail(`Berkas ${WRANGLER_CONFIG} tidak ditemukan. Jalankan dari direktori apps/api.`);
}
if (!existsSync(WRANGLER_BIN)) {
  fail("Wrangler belum terpasang. Jalankan 'npm install' terlebih dahulu.");
}

// Gerbang 1: validasi konfigurasi produksi (read-only).
const validation = validateProductionConfig(WRANGLER_CONFIG);
for (const warning of validation.warnings) console.log(`⚠️  ${warning}`);
if (!validation.ok) {
  console.error("\n❌ Validasi konfigurasi produksi gagal. Deploy DIBATALKAN:");
  for (const error of validation.errors) console.error(`   - ${error}`);
  console.error("\nJalankan 'node scripts/validate-production-config.mjs' untuk detail lengkap.");
  process.exit(1);
}

// Gerbang 2: attestasi operator untuk namespace_id rate limiter.
if (process.env[ATTESTATION_KEY] !== ATTESTATION_VALUE) {
  console.error("\n❌ Attestasi operator belum diberikan. Deploy DIBATALKAN.");
  console.error(`   Set environment variable: ${ATTESTATION_KEY}=${ATTESTATION_VALUE}`);
  console.error("   Lakukan HANYA setelah memverifikasi kedua namespace_id Rate Limiting di akun Cloudflare.");
  console.error("   (Lihat README > Deployment Instructions & Prerequisites.)");
  process.exit(1);
}

const db = (validation.config.d1_databases ?? []).find((entry) => entry?.binding === "DB");
console.log("\n=== Deploy nidhom-api (kode saja) ===");
console.log(`Config    : ${WRANGLER_CONFIG}`);
console.log(`Entrypoint: ${validation.config.main}`);
console.log(`D1 binding: DB -> ${db?.database_name ?? "?"} (${db?.database_id ?? "?"})`);
console.log("Catatan: skrip ini TIDAK menjalankan migrasi D1 atau menulis data produksi.");
console.log("Migrasi D1 adalah langkah terpisah yang memerlukan persetujuan eksplisit.\n");

const forwarded = process.argv.slice(2);
const child = spawn(
  process.execPath,
  [WRANGLER_BIN, "deploy", "--config", WRANGLER_CONFIG, ...forwarded],
  { stdio: "inherit", cwd: API_DIR },
);

child.on("error", (error) => {
  console.error(`\n❌ Gagal menjalankan wrangler: ${error.message}`);
  process.exit(1);
});

child.on("close", (code) => {
  if (code === 0) {
    console.log("\n✅ Deploy selesai.");
  } else {
    console.error(`\n❌ Wrangler keluar dengan kode ${code}. Deploy gagal/dibatalkan.`);
  }
  process.exit(code ?? 1);
});
