import { Hono } from "hono";
import type { AuthEnv } from "../middleware/auth";

interface IzinRow {
  id: string; ref_code: string; guru_id: string; jenis: string; tanggal: string;
  keterangan: string | null; status: string; admin_id: string | null;
  decided_at: string | null; decision_notes: string | null;
  created_at: string; updated_at: string;
  guru_kode: string | null; guru_nama: string | null; admin_username: string | null;
  kelas_id: string | null; mata_pelajaran_id: string | null; jam_terdampak: string | null;
  guru_pengganti_id: string | null; guru_pengganti_nama: string | null;
}

const MAX_PAGE_SIZE = 100;
const MAX_REQUEST_BYTES = 4096;
const controls = /[\u0000-\u001f\u007f]/;

function isValidId(id: string): boolean {
  return id.length > 0 && id.length <= 128 && !controls.test(id);
}
function parsePage(v: string | undefined, fb: number): number | null {
  if (v === undefined) return fb;
  if (!/^[1-9]\d*$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : null;
}
function parsePP(v: string | undefined, fb: number): number | null {
  if (v === undefined) return fb;
  if (!/^[1-9]\d*$/.test(v)) return null;
  const n = Number(v);
  return Number.isSafeInteger(n) ? n : null;
}
function generateRefCode(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = crypto.getRandomValues(new Uint8Array(4));
  const s = Array.from(rnd, b => b.toString(16).padStart(2,"0").toUpperCase()).join("");
  return `IZN-${ts}-${s}`;
}

const izinRoutes = new Hono<AuthEnv>();

// GET /api/izin/me  — teacher's own requests
izinRoutes.get("/me", async (c) => {
  const user = c.get("authUser");
  if (!user || user.role !== "TEACHER") return c.json({ error: "Forbidden" }, 403);
  const page = parsePage(c.req.query("page"), 1);
  const perPage = parsePP(c.req.query("per_page"), 20);
  if (page === null || perPage === null || perPage > MAX_PAGE_SIZE) return c.json({ error: "Parameter halaman tidak valid." }, 400);
  const statusFilter = typeof c.req.query("status") === "string" ? c.req.query("status")!.trim() : "";

  const guruId = user.teacher?.id;
  if (!guruId) return c.json({ error: "Identitas guru tidak tersedia." }, 403);
  const clauses: string[] = ["ip.guru_id = ?"];
  const values: Array<string> = [guruId];
  if (statusFilter) { clauses.push("ip.status = ?"); values.push(statusFilter); }
  const where = `WHERE ${clauses.join(" AND ")}`;

  try {
    const [countRow, rows] = await Promise.all([
      c.env.DB.prepare(`SELECT COUNT(*) AS total FROM izin_pengajuan ip ${where}`).bind(...values).first<{ total: number }>(),
      c.env.DB.prepare(
        `SELECT ip.*, g.kode AS guru_kode, g.nama AS guru_nama, u.username AS admin_username
         FROM izin_pengajuan ip
         LEFT JOIN guru g ON g.id = ip.guru_id
         LEFT JOIN users u ON u.id = ip.admin_id
         ${where} ORDER BY ip.created_at DESC LIMIT ? OFFSET ?`
      ).bind(...values, perPage, (page - 1) * perPage),
    ]);
    const total = countRow?.total ?? 0;
    return c.json({ data: (rows.results ?? []) as unknown as IzinRow[], pagination: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) } });
  } catch { return c.json({ error: "Data izin tidak dapat dimuat." }, 500); }
});

// POST /api/izin  — teacher submits new request
izinRoutes.post("/", async (c) => {
  const user = c.get("authUser");
  if (!user || user.role !== "TEACHER") return c.json({ error: "Forbidden" }, 403);

  try {
    const body = await c.req.json();
    const jenis = typeof body?.jenis === "string" ? body.jenis.trim() : "";
    const tanggal = typeof body?.tanggal === "string" ? body.tanggal.trim() : "";
    const keterangan = typeof body?.keterangan === "string" ? body.keterangan.trim() : null;

    if (!["Sakit", "Izin", "Tidak Hadir"].includes(jenis)) return c.json({ error: "Jenis izin tidak sah." }, 400);
    if (!tanggal || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return c.json({ error: "Format tanggal tidak sah." }, 400);

    const id = crypto.randomUUID();
    const refCode = generateRefCode();
    const now = new Date().toISOString();
    const guruId = user.teacher?.id;
    if (!guruId) return c.json({ error: "Identitas guru tidak tersedia." }, 403);

    const kelasId = typeof body?.kelas_id === "string" ? body.kelas_id.trim() || null : null;
    const mapelId = typeof body?.mata_pelajaran_id === "string" ? body.mata_pelajaran_id.trim() || null : null;
    const jamTerdampak = typeof body?.jam_terdampak === "string" ? body.jam_terdampak.trim() || null : null;
    await c.env.DB.prepare(
      `INSERT INTO izin_pengajuan (id, ref_code, guru_id, jenis, tanggal, keterangan, kelas_id, mata_pelajaran_id, jam_terdampak, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`
    ).bind(id, refCode, guruId, jenis, tanggal, keterangan, kelasId, mapelId, jamTerdampak, now, now).run();

    return c.json({ id, ref_code: refCode, status: "PENDING" }, 201);
  } catch { return c.json({ error: "Pengajuan izin gagal." }, 500); }
});

// GET /api/izin/:id
izinRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!isValidId(id)) return c.json({ error: "Rekod izin tidak ditemukan." }, 404);
  const user = c.get("authUser");
  try {
    const row = await c.env.DB.prepare(
      `SELECT ip.*, g.kode AS guru_kode, g.nama AS guru_nama, u.username AS admin_username
       FROM izin_pengajuan ip
       LEFT JOIN guru g ON g.id = ip.guru_id
       LEFT JOIN users u ON u.id = ip.admin_id
       WHERE ip.id = ? LIMIT 1`
    ).bind(id).first<IzinRow>();
    if (!row) return c.json({ error: "Rekod izin tidak ditemukan." }, 404);
    if (user?.role === "TEACHER" && row.guru_id !== (user.teacher?.id ?? user.id)) return c.json({ error: "Forbidden" }, 403);
    return c.json({ data: row });
  } catch { return c.json({ error: "Rekod izin tidak dapat dimuat." }, 500); }
});

// PATCH /api/izin/:id/decide  — admin approves/rejects
izinRoutes.patch("/:id/decide", async (c) => {
  const user = c.get("authUser");
  if (!user || user.role !== "ADMIN") return c.json({ error: "Forbidden" }, 403);

  const id = c.req.param("id");
  if (!isValidId(id)) return c.json({ error: "Rekod izin tidak ditemukan." }, 404);

  try {
    const existing = await c.env.DB.prepare("SELECT id, status FROM izin_pengajuan WHERE id = ? LIMIT 1").bind(id).first<{ id: string; status: string }>();
    if (!existing) return c.json({ error: "Rekod izin tidak ditemukan." }, 404);
    if (existing.status !== "PENDING") return c.json({ error: "Pengajuan ini sudah diputuskan." }, 409);

    const body = await c.req.json();
    const decision = typeof body?.decision === "string" ? body.decision.trim().toUpperCase() : "";
    const notes = typeof body?.notes === "string" ? body.notes.trim() : null;

    if (!["DISETUJUI", "DITOLAK", "DISESUAIKAN"].includes(decision)) return c.json({ error: "Keputusan tidak sah." }, 400);

    const kelasId = typeof body?.kelas_id === "string" ? body.kelas_id.trim() || null : null;
    const mapelId = typeof body?.mata_pelajaran_id === "string" ? body.mata_pelajaran_id.trim() || null : null;
    const jamTerdampak = typeof body?.jam_terdampak === "string" ? body.jam_terdampak.trim() || null : null;
    const guruPenggantiId = typeof body?.guru_pengganti_id === "string" ? body.guru_pengganti_id.trim() || null : null;
    const guruPenggantiNama = typeof body?.guru_pengganti_nama === "string" ? body.guru_pengganti_nama.trim() || null : null;

    const decidedAt = new Date().toISOString();
    await c.env.DB.prepare(
      `UPDATE izin_pengajuan SET status = ?, admin_id = ?, decided_at = ?, decision_notes = ?,
       kelas_id = COALESCE(?, kelas_id), mata_pelajaran_id = COALESCE(?, mata_pelajaran_id),
       jam_terdampak = COALESCE(?, jam_terdampak), guru_pengganti_id = ?, guru_pengganti_nama = ?, updated_at = ?
       WHERE id = ?`
    ).bind(decision, user.id, decidedAt, notes, kelasId, mapelId, jamTerdampak, guruPenggantiId, guruPenggantiNama, decidedAt, id).run();

    return c.json({ ok: true, status: decision, decided_at: decidedAt });
  } catch { return c.json({ error: "Keputusan izin tidak dapat disimpan." }, 500); }
});

// GET /api/izin  — admin: all requests with filters
izinRoutes.get("/", async (c) => {
  const user = c.get("authUser");
  if (!user || user.role !== "ADMIN") return c.json({ error: "Forbidden" }, 403);

  const page = parsePage(c.req.query("page"), 1);
  const perPage = parsePP(c.req.query("per_page"), 20);
  if (page === null || perPage === null || perPage > MAX_PAGE_SIZE) return c.json({ error: "Parameter halaman tidak valid." }, 400);

  const statusFilter = typeof c.req.query("status") === "string" ? c.req.query("status")!.trim() : "";
  const guruFilter  = typeof c.req.query("guru_id")  === "string" ? c.req.query("guru_id")!.trim()  : "";
  const q           = typeof c.req.query("q")         === "string" ? c.req.query("q")!.trim()         : "";
  const dateFrom    = typeof c.req.query("date_from") === "string" ? c.req.query("date_from")!.trim() : "";
  const dateTo      = typeof c.req.query("date_to")   === "string" ? c.req.query("date_to")!.trim()   : "";

  const clauses: string[] = [];
  const values: Array<string> = [];
  if (statusFilter) { clauses.push("ip.status = ?"); values.push(statusFilter); }
  if (guruFilter)  { clauses.push("ip.guru_id = ?"); values.push(guruFilter); }
  if (q)           { clauses.push("(g.nama LIKE ? OR g.kode LIKE ? OR ip.ref_code LIKE ?)"); const like = `%${q}%`; values.push(like, like, like); }
  if (dateFrom)    { clauses.push("ip.tanggal >= ?"); values.push(dateFrom); }
  if (dateTo)      { clauses.push("ip.tanggal <= ?"); values.push(dateTo); }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

  try {
    const [countRow, rows] = await Promise.all([
      c.env.DB.prepare(`SELECT COUNT(*) AS total FROM izin_pengajuan ip LEFT JOIN guru g ON g.id = ip.guru_id ${where}`).bind(...values).first<{ total: number }>(),
      c.env.DB.prepare(
        `SELECT ip.*, g.kode AS guru_kode, g.nama AS guru_nama, u.username AS admin_username
         FROM izin_pengajuan ip
         LEFT JOIN guru g ON g.id = ip.guru_id
         LEFT JOIN users u ON u.id = ip.admin_id
         ${where} ORDER BY ip.created_at DESC LIMIT ? OFFSET ?`
      ).bind(...values, perPage, (page - 1) * perPage),
    ]);
    const total = countRow?.total ?? 0;
    return c.json({ data: (rows.results ?? []) as unknown as IzinRow[], pagination: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) } });
  } catch { return c.json({ error: "Senarai izin tidak dapat dimuat." }, 500); }
});

export default izinRoutes;

