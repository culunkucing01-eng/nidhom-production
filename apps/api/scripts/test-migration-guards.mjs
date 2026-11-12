// test-migration-guards.mjs
// Unit test untuk apply-migrations.mjs (gerbang migrasi D1 produksi).
//
// Skrip diuji sebagai CHILD PROCESS dengan konfigurasi & direktori migrasi
// SEMENTARA (os.tmpdir). TIDAK menyentuh produksi dan TIDAK PERNAH menyetel
// attestasi yang benar, sehingga wrangler tidak dijalankan dalam tes apa pun.
//
// Jalankan:  node scripts/test-migration-guards.mjs

import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, "apply-migrations.mjs");
// UUID valid tapi BUKAN id produksi — murni untuk pengujian.
const TEST_DB_ID = "11111111-2222-4333-8444-555555555555";

let root;
let configDir;
let migrationsDir;

before(() => {
  root = mkdtempSync(join(tmpdir(), "nidhom-migration-guards-"));
  configDir = join(root, "config");
  migrationsDir = join(root, "migrations");
  mkdirSync(configDir, { recursive: true });
  mkdirSync(migrationsDir, { recursive: true });
  writeFileSync(join(migrationsDir, "0001_contoh.sql"), "-- migrasi uji 1\n");
  writeFileSync(join(migrationsDir, "0002_contoh.sql"), "-- migrasi uji 2\n");
});

after(() => {
  rmSync(root, { recursive: true, force: true });
});

function writeConfig(name, obj) {
  const path = join(configDir, name);
  writeFileSync(path, JSON.stringify(obj), "utf8");
  return path;
}

function validProdConfig(overrides = {}) {
  return {
    name: "nidhom-api",
    main: "src/index.ts",
    vars: { FRONTEND_ORIGINS: "https://sistemgurumanajemen.vercel.app" },
    d1_databases: [
      {
        binding: "DB",
        database_name: "nidhom-db-uji",
        database_id: TEST_DB_ID,
        migrations_dir: migrationsDir, // absolut → dipakai apa adanya oleh resolve()
      },
    ],
    ...overrides,
  };
}

function childEnv(overrides = {}) {
  const env = { ...process.env };
  // Jaminan keselamatan: attestasi tidak boleh terbawa dari lingkungan luar.
  delete env.NIDHOM_D1_MIGRATE_PROD;
  delete env.NIDHOM_WRANGLER_CONFIG;
  return { ...env, ...overrides };
}

function run(args, envOverrides = {}) {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    env: childEnv(envOverrides),
  });
  assert.equal(result.error, undefined, "child process harus dapat dijalankan");
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  return { status: result.status, output };
}

describe("apply-migrations: mode --dry-run", () => {
  test("membaca struktur migrasi .sql dan berhenti tanpa menjalankan wrangler", () => {
    const cfg = writeConfig("valid.jsonc", validProdConfig());
    const { status, output } = run(["--dry-run"], { NIDHOM_WRANGLER_CONFIG: cfg });
    assert.equal(status, 0, "dry-run pada konfigurasi valid harus exit 0");
    assert.match(output, /0001_contoh\.sql/, "harus mencantumkan file migrasi 0001");
    assert.match(output, /0002_contoh\.sql/, "harus mencantumkan file migrasi 0002");
    assert.match(output, /Mode --dry-run/, "harus menyatakan mode dry-run");
    assert.doesNotMatch(
      output,
      /Menerapkan migrasi ke D1 PRODUKSI/,
      "tidak boleh menjalankan wrangler pada dry-run",
    );
  });

  test("memperhitungkan jumlah file migrasi dengan benar", () => {
    const cfg = writeConfig("valid2.jsonc", validProdConfig());
    const { output } = run(["--dry-run"], { NIDHOM_WRANGLER_CONFIG: cfg });
    assert.match(output, /Migrations\s*:\s*2 file/, "harus mendeteksi 2 file migrasi");
  });
});

describe("apply-migrations: gerbang attestasi operator", () => {
  test("tanpa NIDHOM_D1_MIGRATE_PROD migrasi dibatalkan sebelum wrangler", () => {
    const cfg = writeConfig("valid3.jsonc", validProdConfig());
    const { status, output } = run([], { NIDHOM_WRANGLER_CONFIG: cfg });
    assert.equal(status, 1, "tanpa attestasi harus exit 1");
    assert.match(output, /Attestasi operator belum diberikan/, "harus menyatakan attestasi kurang");
    assert.doesNotMatch(
      output,
      /Menerapkan migrasi ke D1 PRODUKSI/,
      "wrangler tidak boleh dijalankan tanpa attestasi",
    );
  });

  test("attestasi dengan nilai salah tetap ditolak", () => {
    const cfg = writeConfig("valid4.jsonc", validProdConfig());
    const { status, output } = run([], {
      NIDHOM_WRANGLER_CONFIG: cfg,
      NIDHOM_D1_MIGRATE_PROD: "BUKAN_NILAI_YANG_BENAR",
    });
    assert.equal(status, 1, "attestasi salah harus ditolak (exit 1)");
    assert.match(output, /Attestasi operator belum diberikan/);
    assert.doesNotMatch(output, /Menerapkan migrasi ke D1 PRODUKSI/);
  });
});

describe("apply-migrations: penolakan konfigurasi D1 lokal / tidak valid", () => {
  test("menolak konfigurasi lokal (nidhom-api-local)", () => {
    const cfg = writeConfig("local-name.jsonc", validProdConfig({ name: "nidhom-api-local" }));
    const { status, output } = run(["--dry-run"], { NIDHOM_WRANGLER_CONFIG: cfg });
    assert.equal(status, 1, "konfigurasi lokal harus ditolak");
    assert.match(output, /LOKAL/i, "pesan harus menandakan konfigurasi lokal");
  });

  test("menolak D1 tanpa database_id (seperti konfigurasi lokal)", () => {
    const cfgObj = validProdConfig();
    delete cfgObj.d1_databases[0].database_id;
    const cfg = writeConfig("tanpa-dbid.jsonc", cfgObj);
    const { status, output } = run(["--dry-run"], { NIDHOM_WRANGLER_CONFIG: cfg });
    assert.equal(status, 1);
    assert.match(output, /database_id/i, "harus menyebut database_id tidak valid");
  });

  test("menolak konfigurasi tanpa binding DB", () => {
    const cfgObj = validProdConfig();
    cfgObj.d1_databases = [];
    const cfg = writeConfig("tanpa-db.jsonc", cfgObj);
    const { status, output } = run(["--dry-run"], { NIDHOM_WRANGLER_CONFIG: cfg });
    assert.equal(status, 1);
    assert.match(output, /Binding D1/i, "harus menyatakan binding DB tidak ditemukan");
  });

  test("menolak konfigurasi JSON rusak", () => {
    const path = join(configDir, "rusak.jsonc");
    writeFileSync(path, "{ ini bukan json yang sah ]", "utf8");
    const { status, output } = run(["--dry-run"], { NIDHOM_WRANGLER_CONFIG: path });
    assert.equal(status, 1);
    assert.match(output, /JSONC|Gagal membaca/i, "harus melaporkan kegagalan parse JSONC");
  });
});
