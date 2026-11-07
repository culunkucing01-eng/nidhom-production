import { Hono, type Context } from "hono";
import type { AuthEnv } from "../middleware/auth";

interface KelasRow {
  id: string;
  nama: string;
  is_active: number;
  jadwal_aktif: number;
  created_at: string;
  updated_at: string;
}

interface KelasBody {
  nama: string;
}

type KelasStatus = "active" | "inactive" | "all";

const MAX_NAME_LENGTH = 200;
const MAX_SEARCH_LENGTH = 100;
const MAX_REQUEST_BYTES = 4096;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const controls = /[\u0000-\u001f\u007f]/;
const encoder = new TextEncoder();

const kelasRoutes = new Hono<AuthEnv>();

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

function validateKelasBody(body: Record<string, unknown> | null): {
  value: KelasBody | null;
  errors: Partial<Record<keyof KelasBody, string>>;
} {
  const errors: Partial<Record<keyof KelasBody, string>> = {};
  const nama = typeof body?.nama === "string" ? body.nama.trim() : "";

  if (!nama) {
    errors.nama = "Nama kelas wajib diisi.";
  } else if (nama.length > MAX_NAME_LENGTH || controls.test(nama)) {
    errors.nama = `Nama kelas maksimal ${MAX_NAME_LENGTH} karakter.`;
  }

  return {
    value: Object.keys(errors).length === 0 ? { nama } : null,
    errors,
  };
}

function isDuplicateNameError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed: kelas.nama");
}

function isValidId(id: string): boolean {
  return id.length > 0 && id.length <= 128 && !controls.test(id);
}

function isAdmin(c: Context<AuthEnv>): boolean {
  return c.get("authUser").role === "ADMIN";
}

function databaseFailure(c: Context<AuthEnv>, operation: string): Response {
  console.error(`Kelas API database operation failed: ${operation}`);
  return c.json({ error: "Data kelas belum dapat diproses. Silakan coba lagi." }, 500);
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

function statusFilter(value: string | undefined): KelasStatus | null {
  if (value === undefined) {
    return "active";
  }
  return value === "active" || value === "inactive" || value === "all" ? value : null;
}

function buildWhere(status: KelasStatus, search: string): {
  sql: string;
  values: Array<string | number>;
} {
  const clauses: string[] = [];
  const values: Array<string | number> = [];

  if (status !== "all") {
    clauses.push("k.is_active = ?");
    values.push(status === "active" ? 1 : 0);
  }
  if (search) {
    clauses.push("k.nama LIKE ? COLLATE NOCASE");
    values.push(`%${search}%`);
  }

  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

const kelasSelect = `SELECT
  k.id,
  k.nama,
  k.is_active,
  (SELECT COUNT(*) FROM jadwal j WHERE j.kelas_id = k.id AND j.is_active = 1) AS jadwal_aktif,
  k.created_at,
  k.updated_at
FROM kelas k`;

kelasRoutes.get("/", async (c) => {
  const page = parsePositiveInteger(c.req.query("page"), 1);
  const perPage = parsePositiveInteger(c.req.query("per_page"), DEFAULT_PAGE_SIZE);
  const status = statusFilter(c.req.query("status"));
  const search = c.req.query("q")?.trim() ?? "";

  if (page === null || perPage === null || perPage > MAX_PAGE_SIZE || status === null || search.length > MAX_SEARCH_LENGTH) {
    return c.json({ error: "Parameter daftar kelas tidak valid." }, 400);
  }

  const where = buildWhere(status, search);
  try {
    const count = await c.env.DB.prepare(
      `SELECT COUNT(*) AS total FROM kelas k ${where.sql}`,
    )
      .bind(...where.values)
      .first<{ total: number }>();

    const total = count?.total ?? 0;
    const rows = await c.env.DB.prepare(
      `${kelasSelect} ${where.sql}
       ORDER BY k.nama COLLATE NOCASE, k.id
       LIMIT ? OFFSET ?`,
    )
      .bind(...where.values, perPage, (page - 1) * perPage)
      .all<KelasRow>();

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

kelasRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!isValidId(id)) {
    return c.json({ error: "Kelas tidak ditemukan." }, 404);
  }

  try {
    const kelas = await c.env.DB.prepare(
      `${kelasSelect} WHERE k.id = ? LIMIT 1`,
    )
      .bind(id)
      .first<KelasRow>();

    return kelas ? c.json({ data: kelas }) : c.json({ error: "Kelas tidak ditemukan." }, 404);
  } catch {
    return databaseFailure(c, "detail");
  }
});

kelasRoutes.post("/", async (c) => {
  if (!isAdmin(c)) {
    return c.json({ error: "Akses hanya untuk administrator." }, 403);
  }

  const validated = validateKelasBody(await readBody(c.req.raw));
  if (!validated.value) {
    return c.json({ error: "Data kelas tidak valid.", fields: validated.errors }, 400);
  }

  const id = crypto.randomUUID();
  try {
    const result = await c.env.DB.prepare(
      `INSERT INTO kelas (id, nama)
       SELECT ?, ?
       WHERE NOT EXISTS (
         SELECT 1 FROM kelas WHERE nama = ? COLLATE NOCASE
       )`,
    )
      .bind(id, validated.value.nama, validated.value.nama)
      .run();
    if (result.meta.changes === 0) {
      return c.json({ error: "Nama kelas sudah digunakan.", fields: { nama: "Nama kelas sudah digunakan." } }, 409);
    }
    const kelas = await c.env.DB.prepare(
      `${kelasSelect} WHERE k.id = ? LIMIT 1`,
    )
      .bind(id)
      .first<KelasRow>();

    if (!kelas) {
      return databaseFailure(c, "create-readback");
    }
    return c.json({ data: kelas }, 201);
  } catch (error) {
    if (isDuplicateNameError(error)) {
      return c.json({ error: "Nama kelas sudah digunakan.", fields: { nama: "Nama kelas sudah digunakan." } }, 409);
    }
    return databaseFailure(c, "create");
  }
});

kelasRoutes.put("/:id", async (c) => {
  if (!isAdmin(c)) {
    return c.json({ error: "Akses hanya untuk administrator." }, 403);
  }

  const id = c.req.param("id");
  if (!isValidId(id)) {
    return c.json({ error: "Kelas tidak ditemukan." }, 404);
  }
  const validated = validateKelasBody(await readBody(c.req.raw));
  if (!validated.value) {
    return c.json({ error: "Data kelas tidak valid.", fields: validated.errors }, 400);
  }

  try {
    const existing = await c.env.DB.prepare("SELECT id FROM kelas WHERE id = ? LIMIT 1")
      .bind(id)
      .first<{ id: string }>();
    if (!existing) {
      return c.json({ error: "Kelas tidak ditemukan." }, 404);
    }

    const result = await c.env.DB.prepare(
      `UPDATE kelas
       SET nama = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND NOT EXISTS (
           SELECT 1 FROM kelas
           WHERE nama = ? COLLATE NOCASE AND id <> ?
         )`,
    )
      .bind(validated.value.nama, id, validated.value.nama, id)
      .run();
    if (result.meta.changes === 0) {
      const current = await c.env.DB.prepare("SELECT id FROM kelas WHERE id = ? LIMIT 1")
        .bind(id)
        .first<{ id: string }>();
      return current
        ? c.json({ error: "Nama kelas sudah digunakan.", fields: { nama: "Nama kelas sudah digunakan." } }, 409)
        : c.json({ error: "Kelas tidak ditemukan." }, 404);
    }
    const kelas = await c.env.DB.prepare(
      `${kelasSelect} WHERE k.id = ? LIMIT 1`,
    )
      .bind(id)
      .first<KelasRow>();

    if (!kelas) {
      return databaseFailure(c, "update-readback");
    }
    return c.json({ data: kelas });
  } catch (error) {
    if (isDuplicateNameError(error)) {
      return c.json({ error: "Nama kelas sudah digunakan.", fields: { nama: "Nama kelas sudah digunakan." } }, 409);
    }
    return databaseFailure(c, "update");
  }
});

kelasRoutes.patch("/:id/status", async (c) => {
  if (!isAdmin(c)) {
    return c.json({ error: "Akses hanya untuk administrator." }, 403);
  }

  const id = c.req.param("id");
  if (!isValidId(id)) {
    return c.json({ error: "Kelas tidak ditemukan." }, 404);
  }
  const body = await readBody(c.req.raw);
  if (typeof body?.isActive !== "boolean") {
    return c.json({
      error: "Status kelas tidak valid.",
      fields: { isActive: "Pilih status aktif atau nonaktif." },
    }, 400);
  }

  try {
    const result = await c.env.DB.prepare(
      `UPDATE kelas
       SET is_active = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND (? = 1 OR NOT EXISTS (
           SELECT 1 FROM jadwal WHERE kelas_id = ? AND is_active = 1
         ))`,
    )
      .bind(body.isActive ? 1 : 0, id, body.isActive ? 1 : 0, id)
      .run();

    if (result.meta.changes === 0) {
      const existing = await c.env.DB.prepare(
        `SELECT
           k.id,
           (SELECT COUNT(*) FROM jadwal j WHERE j.kelas_id = k.id AND j.is_active = 1) AS jadwal_aktif
         FROM kelas k
         WHERE k.id = ?
         LIMIT 1`,
      )
        .bind(id)
        .first<{ id: string; jadwal_aktif: number }>();

      if (!existing) {
        return c.json({ error: "Kelas tidak ditemukan." }, 404);
      }
      if (!body.isActive && existing.jadwal_aktif > 0) {
        return c.json({
          error: "Kelas tidak dapat dinonaktifkan karena masih memiliki jadwal aktif. Nonaktifkan atau pindahkan jadwal tersebut terlebih dahulu.",
          jadwalAktif: existing.jadwal_aktif,
        }, 409);
      }
    }

    const kelas = await c.env.DB.prepare(
      `${kelasSelect} WHERE k.id = ? LIMIT 1`,
    )
      .bind(id)
      .first<KelasRow>();
    return kelas ? c.json({ data: kelas }) : databaseFailure(c, "status-readback");
  } catch {
    return databaseFailure(c, "status");
  }
});

export default kelasRoutes;
