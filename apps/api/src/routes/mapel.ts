import { Hono, type Context } from "hono";
import type { AuthEnv } from "../middleware/auth";

interface MapelRow {
  id: string;
  nama_arab: string;
  nama_indo: string | null;
  is_active: number;
  jadwal_aktif: number;
  created_at: string;
  updated_at: string;
}

interface MapelBody {
  nama_arab: string;
  nama_indo: string | null;
}

type MapelStatus = "active" | "inactive" | "all";

const MAX_NAME_LENGTH = 200;
const MAX_SEARCH_LENGTH = 100;
const MAX_REQUEST_BYTES = 4096;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;
const MAX_OFFSET = 1_000_000;
const controls = /[\u0000-\u001f\u007f]/;
const encoder = new TextEncoder();

const mapelRoutes = new Hono<AuthEnv>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  if (request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return null;
  }

  try {
    const contentLength = Number(request.headers.get("Content-Length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
      return null;
    }

    const text = await request.text();
    if (encoder.encode(text).byteLength > MAX_REQUEST_BYTES) {
      return null;
    }
    const body: unknown = JSON.parse(text);
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

function normalizeName(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ").normalize("NFC");
}

function validateMapelBody(body: Record<string, unknown> | null): {
  value: MapelBody | null;
  errors: Partial<Record<keyof MapelBody, string>>;
} {
  const errors: Partial<Record<keyof MapelBody, string>> = {};
  const namaArab = typeof body?.nama_arab === "string" ? normalizeName(body.nama_arab) : "";
  const rawNamaIndo = body?.nama_indo;
  const namaIndo =
    rawNamaIndo === undefined || rawNamaIndo === null
      ? null
      : typeof rawNamaIndo === "string"
        ? normalizeName(rawNamaIndo) || null
        : "";

  if (!namaArab) {
    errors.nama_arab = "Nama Arab wajib diisi.";
  } else if (namaArab.length > MAX_NAME_LENGTH || controls.test(namaArab)) {
    errors.nama_arab = `Nama Arab maksimal ${MAX_NAME_LENGTH} karakter.`;
  }

  if (typeof rawNamaIndo !== "undefined" && rawNamaIndo !== null && typeof rawNamaIndo !== "string") {
    errors.nama_indo = "Nama Indonesia harus berupa teks.";
  } else if (typeof namaIndo === "string" && (namaIndo.length > MAX_NAME_LENGTH || controls.test(namaIndo))) {
    errors.nama_indo = `Nama Indonesia maksimal ${MAX_NAME_LENGTH} karakter.`;
  }

  return {
    value: Object.keys(errors).length === 0 ? { nama_arab: namaArab, nama_indo: namaIndo } : null,
    errors,
  };
}

function isValidId(id: string): boolean {
  return id.length > 0 && id.length <= 128 && !controls.test(id);
}

function isAdmin(c: Context<AuthEnv>): boolean {
  return c.get("authUser").role === "ADMIN";
}

function databaseFailure(c: Context<AuthEnv>, operation: string): Response {
  console.error(`Mapel API database operation failed: ${operation}`);
  return c.json({ error: "Data mata pelajaran belum dapat diproses. Silakan coba lagi." }, 500);
}

function parsePositiveInteger(value: string | undefined, fallback: number): number | null {
  if (value === undefined) {
    return fallback;
  }
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function statusFilter(value: string | undefined): MapelStatus | null {
  if (value === undefined) {
    return "active";
  }
  return value === "active" || value === "inactive" || value === "all" ? value : null;
}

function buildWhere(status: MapelStatus, search: string): {
  sql: string;
  values: Array<string | number>;
} {
  const clauses: string[] = [];
  const values: Array<string | number> = [];

  if (status !== "all") {
    clauses.push("m.is_active = ?");
    values.push(status === "active" ? 1 : 0);
  }
  if (search) {
    clauses.push("(m.nama_arab LIKE ? COLLATE NOCASE OR COALESCE(m.nama_indo, '') LIKE ? COLLATE NOCASE)");
    values.push(`%${search}%`, `%${search}%`);
  }

  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

const mapelSelect = `SELECT
  m.id,
  m.nama_arab,
  m.nama_indo,
  m.is_active,
  (SELECT COUNT(*) FROM jadwal j WHERE j.mata_pelajaran_id = m.id AND j.is_active = 1) AS jadwal_aktif,
  m.created_at,
  m.updated_at
FROM mata_pelajaran m`;

mapelRoutes.get("/", async (c) => {
  const page = parsePositiveInteger(c.req.query("page"), 1);
  const perPage = parsePositiveInteger(c.req.query("per_page"), DEFAULT_PAGE_SIZE);
  const status = statusFilter(c.req.query("status"));
  const search = c.req.query("q")?.trim() ?? "";

  if (
    page === null ||
    perPage === null ||
    perPage > MAX_PAGE_SIZE ||
    status === null ||
    search.length > MAX_SEARCH_LENGTH
  ) {
    return c.json({ error: "Parameter daftar mata pelajaran tidak valid." }, 400);
  }

  const offset = (page - 1) * perPage;
  if (!Number.isSafeInteger(offset) || offset > MAX_OFFSET) {
    return c.json({ error: "Parameter pagination terlalu besar." }, 400);
  }

  const where = buildWhere(status, search);
  try {
    const count = await c.env.DB.prepare(
      `SELECT COUNT(*) AS total FROM mata_pelajaran m ${where.sql}`,
    )
      .bind(...where.values)
      .first<{ total: number }>();

    const total = count?.total ?? 0;
    const rows = await c.env.DB.prepare(
      `${mapelSelect} ${where.sql}
       ORDER BY m.nama_arab COLLATE NOCASE, m.id
       LIMIT ? OFFSET ?`,
    )
      .bind(...where.values, perPage, offset)
      .all<MapelRow>();

    return c.json({
      data: rows.results,
      pagination: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      },
    });
  } catch {
    return databaseFailure(c, "list");
  }
});

mapelRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!isValidId(id)) {
    return c.json({ error: "Mata pelajaran tidak ditemukan." }, 404);
  }

  try {
    const mapel = await c.env.DB.prepare(
      `${mapelSelect} WHERE m.id = ? LIMIT 1`,
    )
      .bind(id)
      .first<MapelRow>();

    return mapel
      ? c.json({ data: mapel })
      : c.json({ error: "Mata pelajaran tidak ditemukan." }, 404);
  } catch {
    return databaseFailure(c, "detail");
  }
});

mapelRoutes.post("/", async (c) => {
  if (!isAdmin(c)) {
    return c.json({ error: "Akses hanya untuk administrator." }, 403);
  }

  const validated = validateMapelBody(await readBody(c.req.raw));
  if (!validated.value) {
    return c.json({ error: "Data mata pelajaran tidak valid.", fields: validated.errors }, 400);
  }

  const id = crypto.randomUUID();
  try {
    const result = await c.env.DB.prepare(
      `INSERT INTO mata_pelajaran (id, nama_arab, nama_indo)
       SELECT ?, ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM mata_pelajaran WHERE nama_arab = ? COLLATE BINARY
       )`,
    )
      .bind(id, validated.value.nama_arab, validated.value.nama_indo, validated.value.nama_arab)
      .run();
    if (result.meta.changes === 0) {
      return c.json({
        error: "Nama Arab sudah digunakan.",
        fields: { nama_arab: "Nama Arab sudah digunakan." },
      }, 409);
    }

    const mapel = await c.env.DB.prepare(
      `${mapelSelect} WHERE m.id = ? LIMIT 1`,
    )
      .bind(id)
      .first<MapelRow>();

    if (!mapel) {
      return databaseFailure(c, "create-readback");
    }
    return c.json({ data: mapel }, 201);
  } catch {
    return databaseFailure(c, "create");
  }
});

mapelRoutes.put("/:id", async (c) => {
  if (!isAdmin(c)) {
    return c.json({ error: "Akses hanya untuk administrator." }, 403);
  }

  const id = c.req.param("id");
  if (!isValidId(id)) {
    return c.json({ error: "Mata pelajaran tidak ditemukan." }, 404);
  }
  const validated = validateMapelBody(await readBody(c.req.raw));
  if (!validated.value) {
    return c.json({ error: "Data mata pelajaran tidak valid.", fields: validated.errors }, 400);
  }

  try {
    const existing = await c.env.DB.prepare(
      "SELECT id FROM mata_pelajaran WHERE id = ? LIMIT 1",
    )
      .bind(id)
      .first<{ id: string }>();
    if (!existing) {
      return c.json({ error: "Mata pelajaran tidak ditemukan." }, 404);
    }

    const result = await c.env.DB.prepare(
      `UPDATE mata_pelajaran
       SET nama_arab = ?, nama_indo = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND NOT EXISTS (
           SELECT 1 FROM mata_pelajaran
           WHERE nama_arab = ? COLLATE BINARY AND id <> ?
         )`,
    )
      .bind(validated.value.nama_arab, validated.value.nama_indo, id, validated.value.nama_arab, id)
      .run();
    if (result.meta.changes === 0) {
      const current = await c.env.DB.prepare(
        "SELECT id FROM mata_pelajaran WHERE id = ? LIMIT 1",
      )
        .bind(id)
        .first<{ id: string }>();
      return current
        ? c.json({
            error: "Nama Arab sudah digunakan.",
            fields: { nama_arab: "Nama Arab sudah digunakan." },
          }, 409)
        : c.json({ error: "Mata pelajaran tidak ditemukan." }, 404);
    }

    const mapel = await c.env.DB.prepare(
      `${mapelSelect} WHERE m.id = ? LIMIT 1`,
    )
      .bind(id)
      .first<MapelRow>();

    if (!mapel) {
      return databaseFailure(c, "update-readback");
    }
    return c.json({ data: mapel });
  } catch {
    return databaseFailure(c, "update");
  }
});

mapelRoutes.patch("/:id/status", async (c) => {
  if (!isAdmin(c)) {
    return c.json({ error: "Akses hanya untuk administrator." }, 403);
  }

  const id = c.req.param("id");
  if (!isValidId(id)) {
    return c.json({ error: "Mata pelajaran tidak ditemukan." }, 404);
  }
  const body = await readBody(c.req.raw);
  if (typeof body?.isActive !== "boolean") {
    return c.json({
      error: "Status mata pelajaran tidak valid.",
      fields: { isActive: "Pilih status aktif atau nonaktif." },
    }, 400);
  }

  try {
    const result = await c.env.DB.prepare(
      `UPDATE mata_pelajaran
       SET is_active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND (? = 1 OR NOT EXISTS (
           SELECT 1 FROM jadwal
           WHERE mata_pelajaran_id = ? AND is_active = 1
         ))`,
    )
      .bind(body.isActive ? 1 : 0, id, body.isActive ? 1 : 0, id)
      .run();

    if (result.meta.changes === 0) {
      const existing = await c.env.DB.prepare(
        `SELECT
           m.id,
           (SELECT COUNT(*) FROM jadwal j
            WHERE j.mata_pelajaran_id = m.id AND j.is_active = 1) AS jadwal_aktif
         FROM mata_pelajaran m
         WHERE m.id = ?
         LIMIT 1`,
      )
        .bind(id)
        .first<{ id: string; jadwal_aktif: number }>();

      if (!existing) {
        return c.json({ error: "Mata pelajaran tidak ditemukan." }, 404);
      }
      if (!body.isActive && existing.jadwal_aktif > 0) {
        return c.json({
          error: "Mata pelajaran tidak dapat dinonaktifkan karena masih digunakan oleh jadwal aktif.",
          jadwalAktif: existing.jadwal_aktif,
        }, 409);
      }
    }

    const mapel = await c.env.DB.prepare(
      `${mapelSelect} WHERE m.id = ? LIMIT 1`,
    )
      .bind(id)
      .first<MapelRow>();
    return mapel
      ? c.json({ data: mapel })
      : databaseFailure(c, "status-readback");
  } catch {
    return databaseFailure(c, "status");
  }
});

export default mapelRoutes;
