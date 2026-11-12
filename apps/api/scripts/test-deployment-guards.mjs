// test-deployment-guards.mjs
// Unit test untuk validate-production-config.mjs (gerbang keamanan deploy).
//
// Menjalankan secara LOKAL: semua berkas uji ditulis ke direktori temporari
// (os.tmpdir) dan dibersihkan setelah selesai. TIDAK menyentuh produksi,
// TIDAK mengubah wrangler.jsonc asli, dan TIDAK memanggil wrangler.
//
// Jalankan:  node scripts/test-deployment-guards.mjs   (atau: npm run test:deployment-guards)

import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  stripJsonComments,
  loadWranglerConfig,
  validateProductionConfig,
} from "./validate-production-config.mjs";

const VALID_DB_ID = "a9540faf-320b-48df-a849-3c5ca0235ef0";
const workDir = mkdtempSync(join(tmpdir(), "nidhom-deploy-guards-"));
let seq = 0;

function writeConfig(name, contents) {
  const path = join(workDir, name);
  writeFileSync(path, contents, "utf8");
  return path;
}

// Konfigurasi produksi valid sebagai baseline; tiap tes memutasi salinannya.
function validConfig() {
  return {
    name: "nidhom-api",
    main: "src/index.ts",
    vars: { FRONTEND_ORIGINS: "https://sistemgurumanajemen.vercel.app" },
    build: { command: "node scripts/validate-production-config.mjs --wrangler-hook" },
    d1_databases: [
      {
        binding: "DB",
        database_name: "nidhom-production",
        database_id: VALID_DB_ID,
        migrations_dir: "migrations",
      },
    ],
    ratelimits: [
      { name: "LOGIN_IP_RATE_LIMITER", namespace_id: "1111111", simple: { limit: 30, period: 60 } },
      { name: "LOGIN_USERNAME_RATE_LIMITER", namespace_id: "2222222", simple: { limit: 10, period: 60 } },
    ],
  };
}

// Tulis objek config (opsional dimutasi) ke berkas temp, lalu validasi.
function validateObject(mutate) {
  const cfg = validConfig();
  if (typeof mutate === "function") mutate(cfg);
  const path = writeConfig(`cfg-${seq++}.jsonc`, JSON.stringify(cfg));
  return validateProductionConfig(path);
}

after(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe("validate-production-config: skenario valid", () => {
  test("menerima konfigurasi produksi yang lengkap dan benar", () => {
    const result = validateObject();
    assert.equal(result.ok, true, "konfigurasi valid harus lolos tanpa error");
    assert.equal(result.errors.length, 0, "tidak boleh ada error");
    assert.equal(result.warnings.length, 0, "tidak boleh ada peringatan untuk config valid");
  });
});

describe("validate-production-config: skenario kegagalan", () => {
  test("menolak entrypoint lokal (src/local.ts)", () => {
    const result = validateObject((c) => { c.main = "src/local.ts"; });
    assert.equal(result.ok, false, "entrypoint lokal harus ditolak");
    assert.ok(
      result.errors.some((e) => e.includes("src/index.ts")),
      "pesan error harus menyebut entrypoint produksi yang benar",
    );
  });

  test("menolak nama worker lokal (nidhom-api-local)", () => {
    const result = validateObject((c) => { c.name = "nidhom-api-local"; });
    assert.equal(result.ok, false, "nama worker lokal harus ditolak");
    assert.ok(result.errors.some((e) => e.includes("nidhom-api")));
  });

  test("menolak database_name D1 yang salah", () => {
    const result = validateObject((c) => { c.d1_databases[0].database_name = "nidhom-api-local"; });
    assert.equal(result.ok, false, "nama database salah harus ditolak");
    assert.ok(result.errors.some((e) => e.includes("nidhom-production")));
  });

  test("menolak database_id yang kosong atau bukan UUID", () => {
    const kosong = validateObject((c) => { delete c.d1_databases[0].database_id; });
    assert.equal(kosong.ok, false, "database_id kosong harus ditolak");
    assert.ok(kosong.errors.some((e) => e.toLowerCase().includes("database_id")));

    const bukanUuid = validateObject((c) => { c.d1_databases[0].database_id = "bukan-uuid"; });
    assert.equal(bukanUuid.ok, false, "database_id non-UUID harus ditolak");
  });

  test("menolak migrations_dir yang salah", () => {
    const result = validateObject((c) => { c.d1_databases[0].migrations_dir = "migrasi"; });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("migrations_dir")));
  });

  test("menolak namespace_id yang masih placeholder", () => {
    const result = validateObject((c) => {
      c.ratelimits[0].namespace_id = "REPLACE_WITH_OFFICIAL_LOGIN_IP_NAMESPACE_ID";
    });
    assert.equal(result.ok, false, "placeholder harus ditolak");
    assert.ok(result.errors.some((e) => e.includes("placeholder")));
  });

  test("menolak namespace_id yang bukan bilangan bulat positif", () => {
    const result = validateObject((c) => { c.ratelimits[0].namespace_id = "0"; });
    assert.equal(result.ok, false, "nilai 0 bukan bilangan bulat positif");
    assert.ok(result.errors.some((e) => e.includes("bilangan bulat positif")));
  });

  test("menolak namespace_id yang duplikat antar limiter", () => {
    const result = validateObject((c) => { c.ratelimits[1].namespace_id = "1111111"; });
    assert.equal(result.ok, false, "namespace_id duplikat harus ditolak");
    assert.ok(
      result.errors.some((e) => e.includes("BERBEDA") || e.includes("unique")),
      "pesan error harus menjelaskan namespace_id harus unik",
    );
  });

  test("menolak threshold rate limiter yang diubah", () => {
    const result = validateObject((c) => { c.ratelimits[0].simple = { limit: 100, period: 60 }; });
    assert.equal(result.ok, false, "threshold tak boleh diubah");
    assert.ok(result.errors.some((e) => e.includes("30/60")));
  });

  test("menolak ketika salah satu rate limiter hilang", () => {
    const result = validateObject((c) => { c.ratelimits = c.ratelimits.slice(0, 1); });
    assert.equal(result.ok, false, "jumlah rate limiter harus tepat 2");
  });

  test("menolak FRONTEND_ORIGINS yang bukan https", () => {
    const result = validateObject((c) => { c.vars.FRONTEND_ORIGINS = "http://tidak-aman.example"; });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("FRONTEND_ORIGINS")));
  });

  test("mengembalikan error ketika berkas konfigurasi tidak ditemukan", () => {
    const result = validateProductionConfig(join(workDir, "tidak-ada.jsonc"));
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("tidak ditemukan")));
  });

  test("mengembalikan error ketika isi JSON rusak", () => {
    const path = writeConfig("rusak.jsonc", "{ ini bukan json yang sah ]");
    const result = validateProductionConfig(path);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => e.includes("JSONC")));
  });
});

describe("parser JSONC & penanganan BOM", () => {
  test("membuang komentar baris // di luar string", () => {
    const out = stripJsonComments('{\n  // komentar baris\n  "a": 1\n}');
    assert.equal(JSON.parse(out).a, 1);
  });

  test("membuang komentar blok /* */", () => {
    const out = stripJsonComments('{ /* komentar blok */ "a": 1 }');
    assert.equal(JSON.parse(out).a, 1);
  });

  test("mempertahankan // di dalam string (mis. URL https://)", () => {
    const out = stripJsonComments('{ "u": "https://contoh.id/x" }');
    assert.equal(JSON.parse(out).u, "https://contoh.id/x", "URL di dalam string tidak boleh rusak");
  });

  test("mempertahankan escape kutip dan // di dalam string", () => {
    const out = stripJsonComments('{ "s": "a\\"b // c" }');
    assert.equal(JSON.parse(out).s, 'a"b // c');
  });

  test("membaca berkas ber-BOM (UTF-8 BOM) tanpa gagal", () => {
    const path = writeConfig("ber-bom.jsonc", `\uFEFF${JSON.stringify(validConfig())}`);
    const result = validateProductionConfig(path);
    assert.equal(result.ok, true, "berkas dengan BOM harus tetap tervalidasi");
  });

  test("loadWranglerConfig membaca JSONC berkomentar menjadi objek", () => {
    const path = writeConfig("berkomentar.jsonc", '{\n  // nama worker\n  "name": "nidhom-api",\n  "main": "src/index.ts"\n}');
    const cfg = loadWranglerConfig(path);
    assert.equal(cfg.name, "nidhom-api");
    assert.equal(cfg.main, "src/index.ts");
  });
});
