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

interface PerizinanRow {
  id: string;
  judul: string;
  senin: string | null;
  selasa: string | null;
  rabu: string | null;
  kamis: string | null;
  sabtu: string | null;
  ahad: string | null;
  total: number | null;
  created_at: string;
  updated_at: string;
}

interface LogHapusRow {
  id: string;
  waktu_hapus: string;
  waktu_input: string | null;
  tanggal: string | null;
  tahun: number | null;
  bulan: number | null;
  minggu_ke: number | null;
  nama_guru: string | null;
  status: string | null;
  rincian_jam: string | null;
  jumlah_jam: number | null;
  mata_pelajaran: string | null;
  keterangan: string | null;
  created_at: string;
}

const MAX_PAGE_SIZE = 100;
const MAX_REQUEST_BYTES = 4096;
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

const perizinanRoutes = new Hono<AuthEnv>();

// ── Absen ────────────────────────────────────────────────────────────────────

perizinanRoutes.get("/absen", async (c) => {
  const page = parsePage(c.req.query("page"), 1);
  const perPage = parsePositiveInteger(c.req.query("per_page"), 20);
  if (page === null || perPage === null || perPage > MAX_PAGE_SIZE) {
    return c.json({ error: "Parameter halaman tidak valid." }, 400);
  }
  const q = typeof c.req.query("q") === "string" ? c.req.query("q")!.trim() : "";
  const statusFilter = typeof c.req.query("status") === "string" ? c.req.query("status")!.trim() : "";

  const clauses: string[] = [];
  const values: Array<string | number> = [];
  if (q) {
    clauses.push("(guru_nama_sumber LIKE ? OR mata_pelajaran LIKE ? OR keterangan LIKE ?)");
    const like = `%${q}%`;
    values.push(like, like, like);
  }
  if (statusFilter) {
    clauses.push("status = ?");
    values.push(statusFilter);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  try {
    const [countRow, rows] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT COUNT(*) AS total FROM absen ${where}`).bind(...values).first<{ total: number }>(),
      c.env.DB.prepare(`SELECT * FROM absen ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...values, perPage, (page - 1) * perPage),
    ]);
    const total = countRow?.total ?? 0;
    const data = (rows.results ?? []) as unknown as AbsenRow[];
    return c.json({ data, pagination: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) } });
  } catch {
    console.error("Absen list query failed.");
    return c.json({ error: "Data absen belum dapat dimuat." }, 500);
  }
});

perizinanRoutes.get("/absen/:id", async (c) => {
  const id = c.req.param("id");
  if (!isValidId(id)) return c.json({ error: "Rekod absen tidak ditemukan." }, 404);
  try {
    const row = await c.env.DB.prepare("SELECT * FROM absen WHERE id = ? LIMIT 1").bind(id).first<AbsenRow>();
    if (!row) return c.json({ error: "Rekod absen tidak ditemukan." }, 404);
    return c.json({ data: row });
  } catch {
    console.error("Absen detail query failed.");
    return c.json({ error: "Rekod absen tidak dapat dimuat." }, 500);
  }
});

// ── Perizinan (Sheet1) ───────────────────────────────────────────────────────

perizinanRoutes.get("/", async (c) => {
  const page = parsePage(c.req.query("page"), 1);
  const perPage = parsePositiveInteger(c.req.query("per_page"), 20);
  if (page === null || perPage === null || perPage > MAX_PAGE_SIZE) {
    return c.json({ error: "Parameter halaman tidak valid." }, 400);
  }
  const q = typeof c.req.query("q") === "string" ? c.req.query("q")!.trim() : "";

  const clauses: string[] = [];
  const values: Array<string | number> = [];
  if (q) {
    clauses.push("(judul LIKE ? OR senin LIKE ? OR selasa LIKE ? OR rabu LIKE ? OR kamis LIKE ? OR sabtu LIKE ? OR ahad LIKE ?)");
    const like = `%${q}%`;
    values.push(like, like, like, like, like, like, like);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  try {
    const [countRow, rows] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT COUNT(*) AS total FROM perizinan ${where}`).bind(...values).first<{ total: number }>(),
      c.env.DB.prepare(`SELECT * FROM perizinan ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).bind(...values, perPage, (page - 1) * perPage),
    ]);
    const total = countRow?.total ?? 0;
    const data = (rows.results ?? []) as unknown as PerizinanRow[];
    return c.json({ data, pagination: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) } });
  } catch {
    console.error("Perizinan list query failed.");
    return c.json({ error: "Data perizinan belum dapat dimuat." }, 500);
  }
});

perizinanRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!isValidId(id)) return c.json({ error: "Rekod perizinan tidak ditemukan." }, 404);
  try {
    const row = await c.env.DB.prepare("SELECT * FROM perizinan WHERE id = ? LIMIT 1").bind(id).first<PerizinanRow>();
    if (!row) return c.json({ error: "Rekod perizinan tidak ditemukan." }, 404);
    return c.json({ data: row });
  } catch {
    console.error("Perizinan detail query failed.");
    return c.json({ error: "Rekod perizinan tidak dapat dimuat." }, 500);
  }
});

// ── LogHapus ─────────────────────────────────────────────────────────────────

perizinanRoutes.get("/loghapus", async (c) => {
  const page = parsePage(c.req.query("page"), 1);
  const perPage = parsePositiveInteger(c.req.query("per_page"), 20);
  if (page === null || perPage === null || perPage > MAX_PAGE_SIZE) {
    return c.json({ error: "Parameter halaman tidak valid." }, 400);
  }
  try {
    const [countRow, rows] = await c.env.DB.batch([
      c.env.DB.prepare("SELECT COUNT(*) AS total FROM log_hapus").first<{ total: number }>(),
      c.env.DB.prepare("SELECT * FROM log_hapus ORDER BY created_at DESC LIMIT ? OFFSET ?").bind(perPage, (page - 1) * perPage),
    ]);
    const total = countRow?.total ?? 0;
    const data = (rows.results ?? []) as unknown as LogHapusRow[];
    return c.json({ data, pagination: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) } });
  } catch {
    console.error("LogHapus list query failed.");
    return c.json({ error: "Data log hapus belum dapat dimuat." }, 500);
  }
});

perizinanRoutes.get("/loghapus/:id", async (c) => {
  const id = c.req.param("id");
  if (!isValidId(id)) return c.json({ error: "Rekod log tidak ditemukan." }, 404);
  try {
    const row = await c.env.DB.prepare("SELECT * FROM log_hapus WHERE id = ? LIMIT 1").bind(id).first<LogHapusRow>();
    if (!row) return c.json({ error: "Rekod log tidak ditemukan." }, 404);
    return c.json({ data: row });
  } catch {
    console.error("LogHapus detail query failed.");
    return c.json({ error: "Rekod log tidak dapat dimuat." }, 500);
  }
});

export default perizinanRoutes;
