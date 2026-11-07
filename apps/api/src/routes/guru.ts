import { Hono, type Context } from "hono";
import type { AuthEnv } from "../middleware/auth";

interface GuruRow {
  id: string;
  kode: string;
  nama: string;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface GuruBody {
  kode: string;
  nama: string;
}

type GuruStatus = "active" | "inactive" | "all";

const MAX_CODE_LENGTH = 64;
const MAX_NAME_LENGTH = 200;
const MAX_SEARCH_LENGTH = 100;
const MAX_REQUEST_BYTES = 4096;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const controls = /[\u0000-\u001f\u007f]/;
const encoder = new TextEncoder();

const guruRoutes = new Hono<AuthEnv>();

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

function validateGuruBody(body: Record<string, unknown> | null): {
  value: GuruBody | null;
  errors: Partial<Record<keyof GuruBody, string>>;
} {
  const errors: Partial<Record<keyof GuruBody, string>> = {};
  const kode = typeof body?.kode === "string" ? body.kode.trim().toUpperCase() : "";
  const nama = typeof body?.nama === "string" ? body.nama.trim() : "";

  if (!kode) {
    errors.kode = "Kode guru wajib diisi.";
  } else if (kode.length > MAX_CODE_LENGTH || controls.test(kode)) {
    errors.kode = `Kode guru maksimal ${MAX_CODE_LENGTH} karakter.`;
  }

  if (!nama) {
    errors.nama = "Nama guru wajib diisi.";
  } else if (nama.length > MAX_NAME_LENGTH || controls.test(nama)) {
    errors.nama = `Nama guru maksimal ${MAX_NAME_LENGTH} karakter.`;
  }

  return {
    value: Object.keys(errors).length === 0 ? { kode, nama } : null,
    errors,
  };
}

function isDuplicateCodeError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed: guru.kode");
}

function isValidId(id: string): boolean {
  return id.length > 0 && id.length <= 128 && !controls.test(id);
}

function isAdmin(c: Context<AuthEnv>): boolean {
  return c.get("authUser").role === "ADMIN";
}

function databaseFailure(c: Context<AuthEnv>, operation: string): Response {
  console.error(`Guru API database operation failed: ${operation}`);
  return c.json({ error: "Data guru belum dapat diproses. Silakan coba lagi." }, 500);
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

function statusFilter(value: string | undefined): GuruStatus | null {
  if (value === undefined) {
    return "active";
  }
  return value === "active" || value === "inactive" || value === "all" ? value : null;
}

function buildWhere(status: GuruStatus, search: string): {
  sql: string;
  values: Array<string | number>;
} {
  const clauses: string[] = [];
  const values: Array<string | number> = [];

  if (status !== "all") {
    clauses.push("is_active = ?");
    values.push(status === "active" ? 1 : 0);
  }
  if (search) {
    clauses.push("(kode LIKE ? COLLATE NOCASE OR nama LIKE ? COLLATE NOCASE)");
    values.push(`%${search}%`, `%${search}%`);
  }

  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    values,
  };
}

guruRoutes.get("/", async (c) => {
  const page = parsePositiveInteger(c.req.query("page"), 1);
  const perPage = parsePositiveInteger(c.req.query("per_page"), DEFAULT_PAGE_SIZE);
  const status = statusFilter(c.req.query("status"));
  const search = c.req.query("q")?.trim() ?? "";

  if (page === null || perPage === null || perPage > MAX_PAGE_SIZE || status === null || search.length > MAX_SEARCH_LENGTH) {
    return c.json({ error: "Parameter daftar guru tidak valid." }, 400);
  }

  const where = buildWhere(status, search);
  try {
    const count = await c.env.DB.prepare(
      `SELECT COUNT(*) AS total FROM guru ${where.sql}`,
    )
      .bind(...where.values)
      .first<{ total: number }>();

    const total = count?.total ?? 0;
    const rows = await c.env.DB.prepare(
      `SELECT id, kode, nama, is_active, created_at, updated_at
       FROM guru ${where.sql}
       ORDER BY nama COLLATE NOCASE, kode COLLATE NOCASE
       LIMIT ? OFFSET ?`,
    )
      .bind(...where.values, perPage, (page - 1) * perPage)
      .all<GuruRow>();

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

guruRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!isValidId(id)) {
    return c.json({ error: "Guru tidak ditemukan." }, 404);
  }

  try {
    const guru = await c.env.DB.prepare(
      `SELECT id, kode, nama, is_active, created_at, updated_at
       FROM guru WHERE id = ? LIMIT 1`,
    )
      .bind(id)
      .first<GuruRow>();

    return guru ? c.json({ data: guru }) : c.json({ error: "Guru tidak ditemukan." }, 404);
  } catch {
    return databaseFailure(c, "detail");
  }
});

guruRoutes.post("/", async (c) => {
  if (!isAdmin(c)) {
    return c.json({ error: "Akses hanya untuk administrator." }, 403);
  }

  const validated = validateGuruBody(await readBody(c.req.raw));
  if (!validated.value) {
    return c.json({ error: "Data guru tidak valid.", fields: validated.errors }, 400);
  }

  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare("INSERT INTO guru (id, kode, nama) VALUES (?, ?, ?)")
      .bind(id, validated.value.kode, validated.value.nama)
      .run();
    const guru = await c.env.DB.prepare(
      `SELECT id, kode, nama, is_active, created_at, updated_at
       FROM guru WHERE id = ? LIMIT 1`,
    )
      .bind(id)
      .first<GuruRow>();

    if (!guru) {
      return databaseFailure(c, "create-readback");
    }
    return c.json({ data: guru }, 201);
  } catch (error) {
    if (isDuplicateCodeError(error)) {
      return c.json({ error: "Kode guru sudah digunakan.", fields: { kode: "Kode guru sudah digunakan." } }, 409);
    }
    return databaseFailure(c, "create");
  }
});

guruRoutes.put("/:id", async (c) => {
  if (!isAdmin(c)) {
    return c.json({ error: "Akses hanya untuk administrator." }, 403);
  }

  const id = c.req.param("id");
  if (!isValidId(id)) {
    return c.json({ error: "Guru tidak ditemukan." }, 404);
  }
  const validated = validateGuruBody(await readBody(c.req.raw));
  if (!validated.value) {
    return c.json({ error: "Data guru tidak valid.", fields: validated.errors }, 400);
  }

  try {
    const existing = await c.env.DB.prepare("SELECT id FROM guru WHERE id = ? LIMIT 1")
      .bind(id)
      .first<{ id: string }>();
    if (!existing) {
      return c.json({ error: "Guru tidak ditemukan." }, 404);
    }

    await c.env.DB.prepare(
      "UPDATE guru SET kode = ?, nama = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
      .bind(validated.value.kode, validated.value.nama, id)
      .run();
    const guru = await c.env.DB.prepare(
      `SELECT id, kode, nama, is_active, created_at, updated_at
       FROM guru WHERE id = ? LIMIT 1`,
    )
      .bind(id)
      .first<GuruRow>();

    if (!guru) {
      return databaseFailure(c, "update-readback");
    }
    return c.json({ data: guru });
  } catch (error) {
    if (isDuplicateCodeError(error)) {
      return c.json({ error: "Kode guru sudah digunakan.", fields: { kode: "Kode guru sudah digunakan." } }, 409);
    }
    return databaseFailure(c, "update");
  }
});

guruRoutes.patch("/:id/status", async (c) => {
  if (!isAdmin(c)) {
    return c.json({ error: "Akses hanya untuk administrator." }, 403);
  }

  const id = c.req.param("id");
  if (!isValidId(id)) {
    return c.json({ error: "Guru tidak ditemukan." }, 404);
  }
  const body = await readBody(c.req.raw);
  if (typeof body?.isActive !== "boolean") {
    return c.json({
      error: "Status guru tidak valid.",
      fields: { isActive: "Pilih status aktif atau nonaktif." },
    }, 400);
  }

  try {
    const result = await c.env.DB.prepare(
      "UPDATE guru SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
      .bind(body.isActive ? 1 : 0, id)
      .run();
    if (result.meta.changes === 0) {
      return c.json({ error: "Guru tidak ditemukan." }, 404);
    }

    const guru = await c.env.DB.prepare(
      `SELECT id, kode, nama, is_active, created_at, updated_at
       FROM guru WHERE id = ? LIMIT 1`,
    )
      .bind(id)
      .first<GuruRow>();
    return guru ? c.json({ data: guru }) : databaseFailure(c, "status-readback");
  } catch {
    return databaseFailure(c, "status");
  }
});

export default guruRoutes;
