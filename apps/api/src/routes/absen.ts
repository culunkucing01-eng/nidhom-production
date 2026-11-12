import { Hono } from "hono";
import type { AuthEnv } from "../middleware/auth";

interface AbsenRow {
  id: string;
  guru_id: string | null;
  guru_nama_sumber: string;
  tanggal: string;
  status: string;
  rincian_jam: string | null;
  jumlah_jam: number | null;
  mata_pelajaran: string | null;
  keterangan: string | null;
  created_at: string;
  updated_at: string;
}

const ABSEN_STATUSES = ["Izin", "Sakit", "Ghaib"] as const;
const MAX_PAGE_SIZE = 100;
const controls = /[\u0000-\u001f\u007f]/;

function isValidId(id: string): boolean {
  return id.length > 0 && id.length <= 128 && !controls.test(id);
}
function parsePage(value: string | undefined, fallback: number): number | null {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
function parsePositiveInteger(value: string | undefined, fallback: number): number | null {
  if (value === undefined) return fallback;
  if (!/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}
function isDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
function isManagement(role: string): boolean {
  return role === "ADMIN" || role === "LEADERSHIP";
}
function knownStatus(value: string): boolean {
  return (ABSEN_STATUSES as readonly string[]).includes(value);
}

const absenRoutes = new Hono<AuthEnv>();

// GET /api/absen — list (management only)
absenRoutes.get("/", async (c) => {
  if (!isManagement(c.get("authUser").role)) {
    return c.json({ error: "Akses hanya untuk administrator." }, 403);
  }
  const page = parsePage(c.req.query("page"), 1);
  const perPage = parsePositiveInteger(c.req.query("per_page"), 20);
  if (page === null || perPage === null || perPage > MAX_PAGE_SIZE) {
    return c.json({ error: "Parameter halaman tidak valid." }, 400);
  }
  const q = typeof c.req.query("q") === "string" ? c.req.query("q")!.trim() : "";
  const statusFilter = typeof c.req.query("status") === "string" ? c.req.query("status")!.trim() : "";
  const guruFilter = typeof c.req.query("guru_id") === "string" ? c.req.query("guru_id")!.trim() : "";
  const dateFrom = typeof c.req.query("date_from") === "string" ? c.req.query("date_from")!.trim() : "";
  const dateTo = typeof c.req.query("date_to") === "string" ? c.req.query("date_to")!.trim() : "";

  const clauses: string[] = [];
  const values: Array<string | number> = [];
  if (q) {
    clauses.push("(guru_nama_sumber LIKE ? OR mata_pelajaran LIKE ? OR keterangan LIKE ?)");
    const like = `%${q}%`;
    values.push(like, like, like);
  }
  if (statusFilter && knownStatus(statusFilter)) { clauses.push("status = ?"); values.push(statusFilter); }
  if (guruFilter && isValidId(guruFilter)) { clauses.push("guru_id = ?"); values.push(guruFilter); }
  if (dateFrom && isDate(dateFrom)) { clauses.push("tanggal >= ?"); values.push(dateFrom); }
  if (dateTo && isDate(dateTo)) { clauses.push("tanggal <= ?"); values.push(dateTo); }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  try {
    const countRow = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM absen ${where}`).bind(...values).first<{ total: number }>();
    const listRes = await c.env.DB.prepare(`SELECT * FROM absen ${where} ORDER BY tanggal DESC, created_at DESC LIMIT ? OFFSET ?`).bind(...values, perPage, (page - 1) * perPage).all<AbsenRow>();
    const total = countRow?.total ?? 0;
    const data = (listRes.results ?? []) as unknown as AbsenRow[];
    return c.json({ data, pagination: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) } });
  } catch {
    console.error("Absen list query failed.");
    return c.json({ error: "Data absen belum dapat dimuat." }, 500);
  }
});

// GET /api/absen/me — teacher's own records
absenRoutes.get("/me", async (c) => {
  const user = c.get("authUser");
  const page = parsePage(c.req.query("page"), 1);
  const perPage = parsePositiveInteger(c.req.query("per_page"), 20);
  if (page === null || perPage === null || perPage > MAX_PAGE_SIZE) {
    return c.json({ error: "Parameter halaman tidak valid." }, 400);
  }
  const statusFilter = typeof c.req.query("status") === "string" ? c.req.query("status")!.trim() : "";
  const clauses: string[] = [];
  const values: Array<string | number> = [];
  if (user.teacher?.id) { clauses.push("guru_id = ?"); values.push(user.teacher.id); }
  else { clauses.push("guru_nama_sumber = ?"); values.push(user.teacher?.name ?? user.username); }
  if (statusFilter && knownStatus(statusFilter)) { clauses.push("status = ?"); values.push(statusFilter); }
  const where = `WHERE ${clauses.join(" AND ")}`;

  try {
    const countRow = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM absen ${where}`).bind(...values).first<{ total: number }>();
    const listRes = await c.env.DB.prepare(`SELECT * FROM absen ${where} ORDER BY tanggal DESC, created_at DESC LIMIT ? OFFSET ?`).bind(...values, perPage, (page - 1) * perPage).all<AbsenRow>();
    const total = countRow?.total ?? 0;
    const data = (listRes.results ?? []) as unknown as AbsenRow[];
    return c.json({ data, pagination: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) } });
  } catch {
    console.error("Absen (me) query failed.");
    return c.json({ error: "Riwayat absen tidak dapat dimuat." }, 500);
  }
});

// GET /api/absen/history — management: filtered; teacher: own
absenRoutes.get("/history", async (c) => {
  const user = c.get("authUser");
  const management = isManagement(user.role);
  const page = parsePage(c.req.query("page"), 1);
  const perPage = parsePositiveInteger(c.req.query("per_page"), 20);
  if (page === null || perPage === null || perPage > MAX_PAGE_SIZE) {
    return c.json({ error: "Parameter halaman tidak valid." }, 400);
  }
  const statusFilter = typeof c.req.query("status") === "string" ? c.req.query("status")!.trim() : "";
  const guruFilter = typeof c.req.query("guru_id") === "string" ? c.req.query("guru_id")!.trim() : "";
  const dateFrom = typeof c.req.query("date_from") === "string" ? c.req.query("date_from")!.trim() : "";
  const dateTo = typeof c.req.query("date_to") === "string" ? c.req.query("date_to")!.trim() : "";

  const clauses: string[] = [];
  const values: Array<string | number> = [];
  if (!management) {
    if (user.teacher?.id) { clauses.push("guru_id = ?"); values.push(user.teacher.id); }
    else { clauses.push("guru_nama_sumber = ?"); values.push(user.teacher?.name ?? user.username); }
  } else if (guruFilter && isValidId(guruFilter)) {
    clauses.push("guru_id = ?"); values.push(guruFilter);
  }
  if (statusFilter && knownStatus(statusFilter)) { clauses.push("status = ?"); values.push(statusFilter); }
  if (dateFrom && isDate(dateFrom)) { clauses.push("tanggal >= ?"); values.push(dateFrom); }
  if (dateTo && isDate(dateTo)) { clauses.push("tanggal <= ?"); values.push(dateTo); }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  try {
    const countRow = await c.env.DB.prepare(`SELECT COUNT(*) AS total FROM absen ${where}`).bind(...values).first<{ total: number }>();
    const listRes = await c.env.DB.prepare(`SELECT * FROM absen ${where} ORDER BY tanggal DESC, created_at DESC LIMIT ? OFFSET ?`).bind(...values, perPage, (page - 1) * perPage).all<AbsenRow>();
    const total = countRow?.total ?? 0;
    const data = (listRes.results ?? []) as unknown as AbsenRow[];
    return c.json({ data, pagination: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) } });
  } catch {
    console.error("Absen history query failed.");
    return c.json({ error: "Riwayat absen tidak dapat dimuat." }, 500);
  }
});

// GET /api/absen/:id — detail (teacher: own only)
absenRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!isValidId(id)) return c.json({ error: "Rekod absen tidak ditemukan." }, 404);
  const user = c.get("authUser");
  try {
    const row = await c.env.DB.prepare("SELECT * FROM absen WHERE id = ? LIMIT 1").bind(id).first<AbsenRow>();
    if (!row) return c.json({ error: "Rekod absen tidak ditemukan." }, 404);
    if (user.role === "TEACHER" && row.guru_id !== (user.teacher?.id ?? null)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    return c.json({ data: row });
  } catch {
    console.error("Absen detail query failed.");
    return c.json({ error: "Rekod absen tidak dapat dimuat." }, 500);
  }
});

const MAX_REQUEST_BYTES = 4096;
const MAX_NOTE_LENGTH = 500;
const MAX_TEXT_LENGTH = 200;
const MAX_JAM_LENGTH = 100;
const encoder = new TextEncoder();

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || controls.test(trimmed)) return null;
  return trimmed;
}
async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  if (request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return null;
  }
  try {
    const raw = await request.text();
    if (encoder.encode(raw).byteLength > MAX_REQUEST_BYTES) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}
function isDuplicateAbsen(error: unknown): boolean {
  return error instanceof Error && error.message.includes("UNIQUE constraint failed") && error.message.includes("absen");
}

// POST /api/absen — create (teacher: own; management: any guru via guru_id)
absenRoutes.post("/", async (c) => {
  const user = c.get("authUser");
  const body = await readJsonBody(c.req.raw);
  if (!body) return c.json({ error: "Permintaan tidak valid." }, 400);

  const statusRaw = typeof body.status === "string" ? body.status.trim() : "";
  if (!knownStatus(statusRaw)) {
    return c.json({ error: "Status absen tidak sah.", fields: { status: "Pilih Izin, Sakit, atau Ghaib." } }, 400);
  }
  const tanggal = typeof body.tanggal === "string" ? body.tanggal.trim() : "";
  if (!isDate(tanggal)) {
    return c.json({ error: "Format tanggal tidak sah.", fields: { tanggal: "Gunakan format YYYY-MM-DD." } }, 400);
  }
  const rincianJam = cleanText(body.rincian_jam, MAX_JAM_LENGTH);
  const mataPelajaran = cleanText(body.mata_pelajaran, MAX_TEXT_LENGTH);
  const keterangan = cleanText(body.keterangan, MAX_NOTE_LENGTH);

  const jamRaw = body.jumlah_jam;
  let jumlahJam: number | null = null;
  if (jamRaw !== undefined && jamRaw !== null) {
    if (typeof jamRaw !== "number" || !Number.isInteger(jamRaw) || jamRaw < 0) {
      return c.json({ error: "Jumlah jam tidak sah.", fields: { jumlah_jam: "Harus angka ≥ 0." } }, 400);
    }
    jumlahJam = jamRaw;
  }

  let guruId: string;
  if (isManagement(user.role)) {
    const requested = typeof body.guru_id === "string" ? body.guru_id.trim() : "";
    if (!requested || !isValidId(requested)) {
      return c.json({ error: "Guru tidak valid.", fields: { guru_id: "Pilih guru." } }, 400);
    }
    guruId = requested;
  } else {
    if (!user.teacher?.id) return c.json({ error: "Akun guru tidak terhubung." }, 403);
    guruId = user.teacher.id;
  }

  try {
    const guru = await c.env.DB.prepare("SELECT id, nama FROM guru WHERE id = ? AND is_active = 1 LIMIT 1").bind(guruId).first<{ id: string; nama: string }>();
    if (!guru) return c.json({ error: "Guru tidak ditemukan atau tidak aktif." }, 404);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `INSERT INTO absen (id, guru_id, guru_nama_sumber, tanggal, status, rincian_jam, jumlah_jam, mata_pelajaran, keterangan, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, guru.id, guru.nama, tanggal, statusRaw, rincianJam, jumlahJam, mataPelajaran, keterangan, now, now).run();

    const row = await c.env.DB.prepare("SELECT * FROM absen WHERE id = ? LIMIT 1").bind(id).first<AbsenRow>();
    if (!row) return c.json({ error: "Rekod absen gagal disimpan." }, 500);
    return c.json({ data: row }, 201);
  } catch (error) {
    if (isDuplicateAbsen(error)) {
      return c.json({ error: "Catatan absen ini sudah ada.", fields: { tanggal: "Duplikat untuk tanggal & rincian jam yang sama." } }, 409);
    }
    console.error("Absen create failed.");
    return c.json({ error: "Catatan absen gagal disimpan." }, 500);
  }
});

export default absenRoutes;
