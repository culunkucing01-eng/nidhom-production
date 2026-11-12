// validate-production-config.mjs
// Validator READ-ONLY untuk konfigurasi produksi (wrangler.jsonc + D1).
//
// Pagar keselamatan: skrip ini TIDAK PERNAH memanggil wrangler, mengeksekusi
// SQL, menulis berkas, atau menyentuh data produksi. Ia hanya membaca
// wrangler.jsonc dan melaporkan masalah. Keluar dengan kode != 0 apabila
// konfigurasi tidak aman untuk di-deploy (ini memblokir build/deploy).
//
// Pemakaian:
//   node scripts/validate-production-config.mjs                  # cek manual
//   node scripts/validate-production-config.mjs --wrangler-hook  # gerbang build (dipakai build.command)

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const API_DIR = resolve(HERE, "..");
const DEFAULT_CONFIG = resolve(API_DIR, "wrangler.jsonc");

const EXPECTED_WORKER_NAME = "nidhom-api";
const LOCAL_WORKER_NAME = "nidhom-api-local";
const EXPECTED_MAIN = "src/index.ts";
const EXPECTED_DB_BINDING = "DB";
const EXPECTED_DB_NAME = "nidhom-production";
const EXPECTED_MIGRATIONS_DIR = "migrations";
const NAMESPACE_PLACEHOLDER_PREFIX = "REPLACE_WITH";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMITER_SPECS = [
  { name: "LOGIN_IP_RATE_LIMITER", limit: 30, period: 60 },
  { name: "LOGIN_USERNAME_RATE_LIMITER", limit: 10, period: 60 },
];

// Buang komentar // dan /* */ yang berada DI LUAR string, agar URL seperti
// "https://..." di dalam string tetap utuh.
export function stripJsonComments(text) {
  let out = "";
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (inLine) {
      if (ch === "\n") { inLine = false; out += ch; }
      continue;
    }
    if (inBlock) {
      if (ch === "*" && next === "/") { inBlock = false; i += 1; }
      continue;
    }
    if (inString) {
      out += ch;
      if (ch === "\\") { out += next ?? ""; i += 1; }
      else if (ch === '"') { inString = false; }
      continue;
    }
    if (ch === '"') { inString = true; out += ch; continue; }
    if (ch === "/" && next === "/") { inLine = true; i += 1; continue; }
    if (ch === "/" && next === "*") { inBlock = true; i += 1; continue; }
    out += ch;
  }
  return out;
}

export function loadWranglerConfig(configPath = DEFAULT_CONFIG) {
  if (!existsSync(configPath)) {
    throw new Error(`Berkas konfigurasi tidak ditemukan: ${configPath}`);
  }
  const raw = readFileSync(configPath, "utf8").replace(/^\uFEFF/, "");
  try {
    return JSON.parse(stripJsonComments(raw));
  } catch (error) {
    throw new Error(`Gagal membaca ${configPath} sebagai JSONC: ${error.message}`);
  }
}

function isPositiveIntegerString(value) {
  return typeof value === "string" && /^[1-9]\d*$/.test(value);
}

// Validasi murni & read-only. Mengembalikan { ok, errors, warnings, config }.
export function validateProductionConfig(configPath = DEFAULT_CONFIG) {
  const errors = [];
  const warnings = [];
  let config = null;

  try {
    config = loadWranglerConfig(configPath);
  } catch (error) {
    return { ok: false, errors: [error.message], warnings, config: null };
  }

  // Identitas worker & entrypoint (cegah deploy konfigurasi LOKAL).
  if (config.name !== EXPECTED_WORKER_NAME) {
    errors.push(
      `Nama worker harus "${EXPECTED_WORKER_NAME}" untuk produksi (ditemukan: ${JSON.stringify(config.name)}). ` +
        `Pastikan bukan konfigurasi lokal ("${LOCAL_WORKER_NAME}").`,
    );
  }
  if (config.main !== EXPECTED_MAIN) {
    errors.push(
      `Entrypoint produksi harus "${EXPECTED_MAIN}" (ditemukan: ${JSON.stringify(config.main)}). ` +
        `Jangan deploy entrypoint lokal (src/local.ts).`,
    );
  }

  // Target database D1.
  const d1List = Array.isArray(config.d1_databases) ? config.d1_databases : [];
  const dbEntries = d1List.filter((entry) => entry && entry.binding === EXPECTED_DB_BINDING);
  if (dbEntries.length === 0) {
    errors.push(`Tidak ada binding D1 "${EXPECTED_DB_BINDING}" pada d1_databases.`);
  } else {
    if (dbEntries.length > 1) {
      errors.push(`Terdapat lebih dari satu binding D1 "${EXPECTED_DB_BINDING}".`);
    }
    const db = dbEntries[0];
    if (db.database_name !== EXPECTED_DB_NAME) {
      errors.push(
        `database_name D1 harus "${EXPECTED_DB_NAME}" (ditemukan: ${JSON.stringify(db.database_name)}).`,
      );
    }
    if (typeof db.database_id !== "string" || !UUID_RE.test(db.database_id)) {
      errors.push("database_id D1 produksi tidak valid (harus UUID). Konfigurasi lokal tidak boleh dideploy.");
    }
    if (db.migrations_dir !== EXPECTED_MIGRATIONS_DIR) {
      errors.push(
        `migrations_dir harus "${EXPECTED_MIGRATIONS_DIR}" (ditemukan: ${JSON.stringify(db.migrations_dir)}).`,
      );
    }
  }

  // Rate limiter: nama, threshold, dan namespace_id.
  const limiters = Array.isArray(config.ratelimits) ? config.ratelimits : [];
  if (limiters.length !== LIMITER_SPECS.length) {
    errors.push(`Harus ada tepat ${LIMITER_SPECS.length} rate limiter (ditemukan: ${limiters.length}).`);
  }
  const seenIds = [];
  for (const spec of LIMITER_SPECS) {
    const limiter = limiters.find((entry) => entry && entry.name === spec.name);
    if (!limiter) {
      errors.push(`Rate limiter "${spec.name}" tidak ditemukan.`);
      continue;
    }
    const simple = limiter.simple ?? {};
    if (simple.limit !== spec.limit || simple.period !== spec.period) {
      errors.push(
        `Threshold "${spec.name}" harus ${spec.limit}/${spec.period} ` +
          `(ditemukan: ${simple.limit}/${simple.period}). Jangan ubah ambang batas.`,
      );
    }
    const ns = limiter.namespace_id;
    if (typeof ns !== "string" || ns.length === 0) {
      errors.push(`namespace_id "${spec.name}" kosong.`);
    } else if (ns.startsWith(NAMESPACE_PLACEHOLDER_PREFIX)) {
      errors.push(
        `namespace_id "${spec.name}" masih placeholder ("${ns}"). ` +
          `Ganti dengan ID resmi dari akun Cloudflare.`,
      );
    } else if (!isPositiveIntegerString(ns)) {
      errors.push(`namespace_id "${spec.name}" harus bilangan bulat positif (ditemukan: "${ns}").`);
    }
    if (isPositiveIntegerString(ns)) seenIds.push(ns);
  }
  if (seenIds.length === 2 && seenIds[0] === seenIds[1]) {
    errors.push("Kedua namespace_id rate limiter harus BERBEDA (unique).");
  }

  // Origin frontend.
  const origins = config.vars?.FRONTEND_ORIGINS;
  if (typeof origins !== "string" || !origins.startsWith("https://")) {
    errors.push(`vars.FRONTEND_ORIGINS harus URL https yang valid (ditemukan: ${JSON.stringify(origins)}).`);
  }

  // Sanity build hook (informasional).
  if (typeof config.build?.command === "string" && !config.build.command.includes("validate-production-config.mjs")) {
    warnings.push("build.command tidak memanggil validate-production-config.mjs; pertimbangkan menambahkannya sebagai gerbang build.");
  }

  return { ok: errors.length === 0, errors, warnings, config };
}

function report(result, { asHook, target }) {
  const label = asHook ? "GERBANG BUILD WRANGLER" : "VALIDASI KONFIGURASI PRODUKSI";
  console.log(`\n=== ${label}: ${target} ===`);
  if (result.config) {
    const db = (result.config.d1_databases ?? []).find((entry) => entry?.binding === EXPECTED_DB_BINDING);
    console.log(`Worker    : ${result.config.name}`);
    console.log(`Entrypoint: ${result.config.main}`);
    console.log(`D1 target : ${db?.database_name ?? "(tidak ditemukan)"} (binding ${EXPECTED_DB_BINDING})`);
  }
  for (const warning of result.warnings) console.log(`⚠️  ${warning}`);
  if (result.ok) {
    console.log("✅ Konfigurasi produksi valid. Tidak ada operasi destruktif yang dijalankan.");
    return 0;
  }
  console.error("\n❌ Konfigurasi produksi TIDAK valid. Build/deploy DIBATALKAN:");
  for (const error of result.errors) console.error(`   - ${error}`);
  console.error("\nLangkah perbaikan (lihat README > Deployment):");
  console.error("   1. Buat/verifikasi 2 namespace Rate Limiting di akun Cloudflare.");
  console.error("   2. Ganti kedua placeholder namespace_id di wrangler.jsonc dengan ID resmi (bilangan bulat positif, unik).");
  console.error("   3. Jaga nama limiter & threshold (30/IP/60s, 10/username/60s).");
  return 1;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const asHook = process.argv.includes("--wrangler-hook");
  const positional = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  const target = positional ? resolve(positional) : DEFAULT_CONFIG;
  const result = validateProductionConfig(target);
  process.exit(report(result, { asHook, target }));
}
