import { Hono } from "hono";
import type { AuthEnv } from "../middleware/auth";

interface GuruRow {
  id: string;
  kode: string;
  nama: string;
}

interface KelasRow {
  id: string;
  nama: string;
}

interface MapelRow {
  id: string;
  nama_arab: string;
  nama_indo: string | null;
}

interface JadwalRow {
  id: string;
  kelas_id: string;
  guru_id: string;
  mata_pelajaran_id: string;
  day_index: number;
  period: number;
  kelas_nama: string;
  guru_nama: string;
  mapel_nama_arab: string;
  mapel_nama_indo: string | null;
}

type GuruStatusFilter = "active" | "inactive" | "all";
type KelasStatusFilter = "active" | "inactive" | "all";
type MapelStatusFilter = "active" | "inactive" | "all";

const MAX_PAGE_SIZE = 100;
const MAX_SEARCH_LENGTH = 128;
const MAX_REQUEST_BYTES = 4096;
const DEFAULT_PAGE_SIZE = 20;
const controls = /[\u0000-\u001f\u007f]/;

const jadwalRoutes = new Hono<AuthEnv>();

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

function parseFilterStatus(value: string | undefined): string | null {
  if (value === undefined) return null;
  if (!["active", "inactive", "all"].includes(value)) return null;
  return value;
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  if (request.headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    return null;
  }
  try {
    const contentLength = Number(request.headers.get("Content-Length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) return null;
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_REQUEST_BYTES) return null;
    const body: unknown = JSON.parse(text);
    return typeof body === "object" && body !== null && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

function isValidId(id: string): boolean {
  return id.length > 0 && id.length <= 128 && !controls.test(id);
}

function buildWhere(
  filters: Record<string, string>,
  qValue: string,
): { sql: string; values: Array<string | number> } {
  const clauses: string[] = [];
  const values: Array<string | number> = [];

  if (filters.guru) {
    clauses.push("g.kode = ?");
    values.push(filters.guru);
  }
  if (filters.kelas) {
    clauses.push("k.id = ?");
    values.push(filters.kelas);
  }
  if (filters.mapel) {
    clauses.push("m.id = ?");
    values.push(filters.mapel);
  }
  if (filters.day_index) {
    clauses.push("j.day_index = ?");
    values.push(Number(filters.day_index));
  }
  if (filters.period) {
    clauses.push("j.period = ?");
    values.push(Number(filters.period));
  }

  if (qValue) {
    clauses.push(
      `(g.kode LIKE ? OR g.nama LIKE ? OR k.nama LIKE ? OR m.nama_arab LIKE ? OR m.nama_indo LIKE ?)`,
    );
    const like = `%${qValue}%`;
    values.push(like, like, like, like, like);
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  return { sql: where, values };
}

const SELECT_COLUMNS = `
  j.id,
  j.kelas_id,
  j.guru_id,
  j.mata_pelajaran_id,
  j.day_index,
  j.period,
  k.nama        AS kelas_nama,
  g.kode        AS guru_kode,
  g.nama        AS guru_nama,
  m.nama_arab   AS mapel_nama_arab,
  m.nama_indo   AS mapel_nama_indo`;

function applyCommonFilters(
  where: string,
  values: Array<string | number>,
  filters: Record<string, string>,
  qValue: string,
): { sql: string; values: Array<string | number> } {
  const clauses: string[] = [];
  const v: Array<string | number> = [...values];

  if (filters.guru) { clauses.push("g.kode = ?"); v.push(filters.guru); }
  if (filters.kelas) { clauses.push("k.id = ?"); v.push(filters.kelas); }
  if (filters.mapel)  { clauses.push("m.id = ?"); v.push(filters.mapel); }
  if (filters.day_index) { clauses.push("j.day_index = ?"); v.push(Number(filters.day_index)); }
  if (filters.period)    { clauses.push("j.period = ?"); v.push(Number(filters.period)); }

  if (qValue) {
    clauses.push("(g.kode LIKE ? OR g.nama LIKE ? OR k.nama LIKE ? OR m.nama_arab LIKE ? OR m.nama_indo LIKE ?)");
    const like = `%${qValue}%`;
    v.push(like, like, like, like, like);
  }

  const w = clauses.length > 0
    ? (where ? `${where} AND ${clauses.join(" AND ")}` : `WHERE ${clauses.join(" AND ")}`)
    : where;
  return { sql: w, values: v };
}

jadwalRoutes.get("/", async (c) => {
  const raw = c.req.query("filters");
  let filters: Record<string, string> = {};
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      filters = typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? parsed as Record<string, string>
        : {};
    } catch {
      filters = {};
    }
  }
  const page = parsePage(c.req.query("page"), 1);
  const perPage = parsePositiveInteger(c.req.query("per_page"), DEFAULT_PAGE_SIZE);
  if (page === null || perPage === null || perPage > MAX_PAGE_SIZE) {
    return c.json({ error: "Parameter halaman tidak valid." }, 400);
  }
  const qValue = typeof filters.q === "string" ? filters.q.trim() : "";
  if (qValue.length > MAX_SEARCH_LENGTH) {
    return c.json({ error: "Pencarian terlalu panjang." }, 400);
  }

  const { sql: where, values } = applyCommonFilters("", [], filters, qValue);

  try {
    const [countRow, rows] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT COUNT(*) AS total FROM jadwal j JOIN guru g ON g.id = j.guru_id JOIN kelas k ON k.id = j.kelas_id JOIN mata_pelajaran m ON m.id = j.mata_pelajaran_id ${where}`)
        .bind(...values)
        .first<{ total: number }>(),
      c.env.DB.prepare(
        `SELECT ${SELECT_COLUMNS} FROM jadwal j JOIN guru g ON g.id = j.guru_id JOIN kelas k ON k.id = j.kelas_id JOIN mata_pelajaran m ON m.id = j.mata_pelajaran_id ${where} ORDER BY j.created_at DESC, j.id DESC LIMIT ? OFFSET ?`,
      ).bind(...values, perPage, (page - 1) * perPage),
    ]);

    const total = countRow?.total ?? 0;
    const data = (rows.results ?? []) as unknown as JadwalRow[];

    return c.json({
      data,
      pagination: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) },
    });
  } catch {
    console.error("Jadwal list query failed.");
    return c.json({ error: "Data jadwal belum dapat dimuat." }, 500);
  }
});

jadwalRoutes.get("/timetable", async (c) => {
  const page = parsePage(c.req.query("page"), 1);
  const perPage = parsePositiveInteger(c.req.query("per_page"), 100);
  if (page === null || perPage === null || perPage > 1000) {
    return c.json({ error: "Parameter halaman tidak valid." }, 400);
  }
  try {
    const { results: data } = await c.env.DB
      .prepare(
        `SELECT ${SELECT_COLUMNS} FROM jadwal j JOIN guru g ON g.id = j.guru_id JOIN kelas k ON k.id = j.kelas_id JOIN mata_pelajaran m ON m.id = j.mata_pelajaran_id ORDER BY j.created_at DESC, j.id DESC LIMIT ? OFFSET ?`,
      )
      .bind((page - 1) * perPage, perPage)
      .all<JadwalRow>();

    const rows = (data ?? []) as JadwalRow[];
    const days = ["sabtu", "ahad", "senin", "selasa", "rabu", "kamis"] as const;
    const periods = [1, 2, 3, 4] as const;
    type DayName = (typeof days)[number];
    type PeriodNum = (typeof periods)[number];
    const grid: Record<DayName, Record<PeriodNum, JadwalRow | null>> = {} as Record<DayName, Record<PeriodNum, JadwalRow | null>>;
    for (const d of days) { grid[d] = { 1: null, 2: null, 3: null, 4: null }; }
    for (const item of rows) {
      const dayIdx = item.day_index;
      if (dayIdx < 0 || dayIdx >= days.length) continue;
      const day = days[dayIdx] as DayName;
      const p = item.period as PeriodNum;
      if (periods.includes(p)) grid[day][p] = item;
    }

    return c.json({ days, periods, grid, count: rows.length });
  } catch {
    console.error("Jadwal timetable query failed.");
    return c.json({ error: "Diagram jadwal belum dapat dimuat." }, 500);
  }
});

jadwalRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!isValidId(id)) {
    return c.json({ error: "Jadwal tidak ditemukan." }, 404);
  }
  try {
    const result = await c.env.DB
      .prepare(
        `SELECT ${SELECT_COLUMNS} FROM jadwal j JOIN guru g ON g.id = j.guru_id JOIN kelas k ON k.id = j.kelas_id JOIN mata_pelajaran m ON m.id = j.mata_pelajaran_id WHERE j.id = ? LIMIT 1`,
      )
      .bind(id)
      .first<JadwalRow>();

    if (!result) {
      return c.json({ error: "Jadwal tidak ditemukan." }, 404);
    }
    return c.json({ data: result });
  } catch {
    console.error("Jadwal detail query failed.");
    return c.json({ error: "Data jadwal tidak dapat dimuat." }, 500);
  }
});

export default jadwalRoutes;



