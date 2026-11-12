import { Hono } from "hono";
import { requireRole, type AuthEnv } from "../middleware/auth";
import {
  ExcelImportError,
  getImportFields,
  hashWorkbook,
  inspectWorkbook,
  isImportEntityType,
  normalizeSheetRows,
  readWorkbook,
  validateWorkbookFile,
  type ImportEntityType,
  type ImportIssue,
  type ImportMapping,
} from "../lib/excel-import";

type ImportAction = "inserted" | "updated" | "duplicate" | "failed";

interface ImportSummary {
  totalRows: number;
  inserted: number;
  updated: number;
  duplicates: number;
  failed: number;
}

interface ImportResponse {
  summary: ImportSummary;
  issues: ImportIssue[];
}

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

interface SourceKeyRow {
  source_key: string;
  entity_id: string;
}

interface JadwalRow {
  id: string;
  kelas_id: string;
  guru_id: string;
  mata_pelajaran_id: string;
  day_index: number;
  period: number;
}

interface PerizinanRow {
  id: string;
  guru_kode_sumber: string | null;
  guru_nama_sumber: string;
  judul: string;
  senin: number;
  selasa: number;
  rabu: number;
  kamis: number;
  sabtu: number;
  minggu: number;
  total: number;
}

interface AbsenRow {
  id: string;
  tanggal: string;
  guru_nama_sumber: string;
  rincian_jam: string | null;
}

interface LogHapusRow {
  id: string;
  waktu_hapus: string | null;
  nama_guru: string;
}

interface PlannedRow {
  row: number;
  action: ImportAction;
  values: Record<string, string>;
  payload?: Record<string, string | number | null>;
  issue?: ImportIssue;
}

interface ImportPlan {
  entityType: ImportEntityType;
  rows: PlannedRow[];
  issues: ImportIssue[];
  summary: ImportSummary;
  entityWrites: Array<Record<string, string | number | null>>;
  sourceKeyWrites: Array<{ entity_type: string; source_key: string; entity_id: string }>;
  mapping: ImportMapping;
}

const MAX_FORM_BYTES = 2 * 1024 * 1024 + 32 * 1024;
const MAX_PAGE_SIZE = 50;
const controlCharacters = /[\u0000-\u001f\u007f]/;
const imports = new Hono<AuthEnv>();

imports.use("*", requireRole("ADMIN"));

function parsePage(value: string | undefined, fallback: number): number | null {
  if (value === undefined) {
    return fallback;
  }
  if (!/^[1-9]\d*$/.test(value)) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(",");
}

function compareText(left: string, right: string): boolean {
  return left.trim().toLocaleLowerCase("id-ID") === right.trim().toLocaleLowerCase("id-ID");
}

function addIssue(
  row: PlannedRow,
  column: string | null,
  code: string,
  message: string,
): void {
  row.action = "failed";
  row.issue = { row: row.row, column, code, message };
}

function rowValue(row: PlannedRow, field: string): string {
  return row.values[field]?.trim() ?? "";
}

function normalizeDay(value: string): number | null {
  if (/^[0-5]$/.test(value)) {
    return Number(value);
  }
  const dayIndex: Record<string, number> = {
    sabtu: 0,
    ahad: 1,
    minggu: 1,
    senin: 2,
    selasa: 3,
    rabu: 4,
    kamis: 5,
  };
  return dayIndex[value.trim().toLocaleLowerCase("id-ID")] ?? null;
}

function normalizePeriod(value: string): number | null {
  const match = value.match(/^(?:jam\s*)?([1-4])$/i);
  return match ? Number(match[1]) : null;
}

function canonicalValue(row: PlannedRow): string {
  return JSON.stringify(row.values);
}

function summarize(rows: PlannedRow[]): ImportSummary {
  return rows.reduce<ImportSummary>(
    (summary, row) => {
      summary.totalRows += 1;
      if (row.action === "inserted") summary.inserted += 1;
      if (row.action === "updated") summary.updated += 1;
      if (row.action === "duplicate") summary.duplicates += 1;
      if (row.action === "failed") summary.failed += 1;
      return summary;
    },
    { totalRows: 0, inserted: 0, updated: 0, duplicates: 0, failed: 0 },
  );
}

async function readAll<T>(db: D1Database, sql: string, values: unknown[] = []): Promise<T[]> {
  const result = await db.prepare(sql).bind(...values).all<T>();
  return result.results;
}

async function readForm(c: Parameters<typeof imports.post>[1] extends never ? never : never) {
  return c;
}

async function readUpload(c: import("hono").Context<AuthEnv>) {
  const request = c.req.raw;
  const contentType = request.headers.get("Content-Type")?.toLowerCase() ?? "";
  const contentLength = Number(request.headers.get("Content-Length"));
  if (!contentType.startsWith("multipart/form-data")) {
    throw new ExcelImportError(415, "multipart_required", "Kirim file menggunakan formulir upload.");
  }
  if (Number.isFinite(contentLength) && contentLength > MAX_FORM_BYTES) {
    throw new ExcelImportError(413, "file_size_limit", "Ukuran file maksimal 2 MB.");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new ExcelImportError(400, "invalid_form", "Formulir upload tidak dapat dibaca.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new ExcelImportError(400, "file_required", "Pilih file Excel terlebih dahulu.");
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new ExcelImportError(413, "file_size_limit", "Ukuran file maksimal 2 MB.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validatedFile = validateWorkbookFile(file.name, file.type, bytes);
  const workbook = readWorkbook(bytes);
  return {
    form,
    bytes,
    workbook,
    fileName: validatedFile.safeFileName,
    fileHash: await hashWorkbook(bytes),
  };
}

function readMapping(form: FormData): ImportMapping {
  const value = form.get("mapping");
  if (typeof value !== "string") {
    throw new ExcelImportError(400, "mapping_required", "Pemetaan kolom wajib diisi.");
  }
  let mapping: unknown;
  try {
    mapping = JSON.parse(value);
  } catch {
    throw new ExcelImportError(400, "invalid_mapping", "Pemetaan kolom tidak valid.");
  }
  if (typeof mapping !== "object" || mapping === null || Array.isArray(mapping)) {
    throw new ExcelImportError(400, "invalid_mapping", "Pemetaan kolom tidak valid.");
  }
  return mapping as ImportMapping;
}

function readSelectedSheet(form: FormData): {
  sheetName: string;
  entityType: ImportEntityType;
  mapping: ImportMapping;
} {
  const sheetName = form.get("sheetName");
  const entityType = form.get("entityType");
  if (typeof sheetName !== "string" || !sheetName.trim() || typeof entityType !== "string") {
    throw new ExcelImportError(400, "sheet_required", "Pilih sheet dan jenis data.");
  }
  if (!isImportEntityType(entityType)) {
    throw new ExcelImportError(400, "invalid_entity_type", "Jenis data tidak didukung.");
  }
  return { sheetName, entityType, mapping: readMapping(form) };
}

function validateRecordFields(row: PlannedRow, entityType: ImportEntityType): void {
  const fields = getImportFields(entityType);
  for (const field of fields) {
    const value = rowValue(row, field.key);
    if (field.required && !value) {
      addIssue(row, field.key, "required_value", `${field.label} wajib diisi.`);
      return;
    }
    if (value.length > 200 || controlCharacters.test(value)) {
      addIssue(row, field.key, "invalid_value", `${field.label} tidak memiliki format yang valid.`);
      return;
    }
  }

  if (entityType === "guru") {
    row.values.code = rowValue(row, "code").toUpperCase();
    if (row.values.code.length > 64) {
      addIssue(row, "code", "invalid_value", "Kode guru maksimal 64 karakter.");
    }
  } else if (entityType === "jadwal") {
    const dayIndex = normalizeDay(rowValue(row, "dayIndex"));
    const period = normalizePeriod(rowValue(row, "period"));
    if (dayIndex === null) {
      addIssue(row, "dayIndex", "invalid_value", "Hari harus Sabtu sampai Kamis atau indeks 0 sampai 5.");
      return;
    }
    if (period === null) {
      addIssue(row, "period", "invalid_value", "Jam harus berupa periode 1 sampai 4.");
      return;
    }
    row.payload = { dayIndex, period };
  } else if (entityType === "perizinan") {
    for (const field of ["senin", "selasa", "rabu", "kamis", "sabtu", "minggu", "total"]) {
      const parsed = Number.parseInt(rowValue(row, field), 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        addIssue(row, field, "invalid_value", "Nilai harus berupa angka nol atau lebih.");
        return;
      }
      row.values[field] = String(parsed);
    }
  } else if (entityType === "absen") {
    const tanggal = rowValue(row, "tanggal");
    const date = new Date(`${tanggal}T00:00:00`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal) || Number.isNaN(date.getTime())) {
      addIssue(row, "tanggal", "invalid_value", "Tanggal harus dalam format YYYY-MM-DD.");
      return;
    }
    const status = rowValue(row, "status").trim();
    const normalizedStatus = status.toLowerCase("id-ID") === "izin" ? "Izin" : status;
    if (!["Izin", "Sakit", "Ghaib"].includes(normalizedStatus)) {
      addIssue(row, "status", "invalid_value", "Status harus Izin, Sakit, atau Ghaib.");
      return;
    }
    row.values.status = normalizedStatus;
  } else if (entityType === "loghapus") {
    const jumlahJam = rowValue(row, "jumlahJam");
    if (jumlahJam !== "" && (!Number.isFinite(Number.parseInt(jumlahJam, 10)) || Number.parseInt(jumlahJam, 10) < 0)) {
      addIssue(row, "jumlahJam", "invalid_value", "Jumlah jam harus berupa angka nol atau lebih.");
      return;
    }
  }
}

function markInputDuplicates(rows: PlannedRow[], entityType: ImportEntityType): void {
  const seen = new Map<string, PlannedRow>();
  for (const row of rows) {
    if (row.action === "failed") continue;
    const key =
      entityType === "guru"
        ? `guru:${rowValue(row, "code").toLocaleLowerCase("id-ID")}`
        : entityType === "kelas"
          ? `kelas:${rowValue(row, "name").toLocaleLowerCase("id-ID")}`
          : entityType === "mapel"
            ? `mapel:${rowValue(row, "sourceKey")}`
            : entityType === "jadwal"
              ? `jadwal:${rowValue(row, "classKey")}:${row.payload?.dayIndex}:${row.payload?.period}`
              : entityType === "perizinan"
                ? `perizinan:${rowValue(row, "sourceKey") || rowValue(row, "judul")}`
                : entityType === "absen"
                  ? `absen:${rowValue(row, "namaGuru")}|${rowValue(row, "tanggal")}|${rowValue(row, "rincianJam")}`
                  : entityType === "loghapus"
                    ? `loghapus:${rowValue(row, "waktuHapus") || rowValue(row, "namaGuru")}|${rowValue(row, "tanggal") || ""}`
                    : `pengaturan:${rowValue(row, "kunci")}`;
    const first = seen.get(key);
    if (!first) {
      seen.set(key, row);
    } else if (canonicalValue(first) === canonicalValue(row)) {
      row.action = "duplicate";
    } else {
      addIssue(row, null, "duplicate_input_conflict", "Kunci data berulang dengan isi yang berbeda.");
    }
  }
}

function buildRows(
  workbook: ReturnType<typeof readWorkbook>,
  sheetName: string,
  entityType: ImportEntityType,
  mapping: ImportMapping,
): PlannedRow[] {
  const { records } = normalizeSheetRows(workbook, sheetName, entityType, mapping);
  const rows = records.map<PlannedRow>((record) => ({
    row: record.row,
    action: "failed",
    values: record.values,
  }));
  for (const row of rows) {
    row.action = "inserted";
    validateRecordFields(row, entityType);
  }
  if (entityType === "jadwal") {
    for (const row of rows) {
      row.payload = {
        dayIndex: parseInt(rowValue(row, "dayIndex") || "0", 10),
        period: parseInt(rowValue(row, "period") || "0", 10),
      };
    }
  }
  if (entityType === "jadwal") {
    for (const row of rows) {
      row.payload = {
        dayIndex: parseInt(rowValue(row, "dayIndex") || "0", 10),
        period: parseInt(rowValue(row, "period") || "0", 10),
      };
    }
  }
  markInputDuplicates(rows, entityType);
  return rows;
}

async function loadSourceKeys(
  db: D1Database,
  entityType: "guru" | "kelas" | "mapel",
): Promise<Map<string, string>> {
  const rows = await readAll<SourceKeyRow>(
    db,
    "SELECT source_key, entity_id FROM import_source_keys WHERE entity_type = ?",
    [entityType],
  );
  return new Map(rows.map((row) => [row.source_key, row.entity_id]));
}

async function analyzeMasterImport(
  db: D1Database,
  rows: PlannedRow[],
  entityType: ImportEntityType,
): Promise<{ writes: Array<Record<string, string | number | null>>; keys: ImportPlan["sourceKeyWrites"] }> {
  const pending = rows.filter((row) => row.action !== "duplicate" && row.action !== "failed");
  const sourceKeys = await loadSourceKeys(db, entityType);
  const keysToAdd: ImportPlan["sourceKeyWrites"] = [];
  const writes: Array<Record<string, string | number | null>> = [];

  if (entityType === "guru") {
    const existing = await readAll<GuruRow>(db, "SELECT id, kode, nama FROM guru");
    const byId = new Map(existing.map((row) => [row.id, row]));
    const byCode = new Map(existing.map((row) => [row.kode.toLocaleLowerCase("id-ID"), row]));
    for (const row of pending) {
      const sourceKey = rowValue(row, "sourceKey");
      const code = rowValue(row, "code");
      const name = rowValue(row, "name");
      const mappedId = sourceKeys.get(sourceKey);
      const current = mappedId ? byId.get(mappedId) : byCode.get(code.toLocaleLowerCase("id-ID"));
      if (mappedId && !current) {
        addIssue(row, "sourceKey", "stale_source_key", "Referensi sumber tidak lagi tersedia.");
        continue;
      }
      const conflict = byCode.get(code.toLocaleLowerCase("id-ID"));
      if (conflict && current && conflict.id !== current.id) {
        addIssue(row, "code", "unique_conflict", "Kode guru sudah digunakan oleh data lain.");
        continue;
      }
      const id = current?.id ?? crypto.randomUUID();
      const same = current && current.kode === code && current.nama === name;
      row.action = same ? "duplicate" : current ? "updated" : "inserted";
      row.payload = { id, code, name };
      if (!same) writes.push({ id, code, name });
      keysToAdd.push({ entity_type: entityType, source_key: sourceKey, entity_id: id });
    }
  } else if (entityType === "kelas") {
    const existing = await readAll<KelasRow>(db, "SELECT id, nama FROM kelas");
    const byId = new Map(existing.map((row) => [row.id, row]));
    const byName = new Map(existing.map((row) => [row.nama.toLocaleLowerCase("id-ID"), row]));
    for (const row of pending) {
      const sourceKey = rowValue(row, "sourceKey");
      const name = rowValue(row, "name");
      const mappedId = sourceKeys.get(sourceKey);
      const current = mappedId ? byId.get(mappedId) : byName.get(name.toLocaleLowerCase("id-ID"));
      if (mappedId && !current) {
        addIssue(row, "sourceKey", "stale_source_key", "Referensi sumber tidak lagi tersedia.");
        continue;
      }
      const conflict = byName.get(name.toLocaleLowerCase("id-ID"));
      if (conflict && current && conflict.id !== current.id) {
        addIssue(row, "name", "unique_conflict", "Nama kelas sudah digunakan oleh data lain.");
        continue;
      }
      const id = current?.id ?? crypto.randomUUID();
      const same = current && current.nama === name;
      row.action = same ? "duplicate" : current ? "updated" : "inserted";
      row.payload = { id, name };
      if (!same) writes.push({ id, name });
      keysToAdd.push({ entity_type: entityType, source_key: sourceKey, entity_id: id });
    }
  } else if (entityType === "mapel") {
    const existing = await readAll<MapelRow>(
      db,
      "SELECT id, nama_arab, nama_indo FROM mata_pelajaran",
    );
    const byId = new Map(existing.map((row) => [row.id, row]));
    const byArabicName = new Map<string, MapelRow[]>();
    for (const mapel of existing) {
      const key = mapel.nama_arab.toLocaleLowerCase("id-ID");
      byArabicName.set(key, [...(byArabicName.get(key) ?? []), mapel]);
    }
    for (const row of pending) {
      const sourceKey = rowValue(row, "sourceKey");
      const arabicName = rowValue(row, "arabicName");
      const indonesianName = rowValue(row, "indonesianName") || null;
      const mappedId = sourceKeys.get(sourceKey);
      const matches = byArabicName.get(arabicName.toLocaleLowerCase("id-ID")) ?? [];
      const current = mappedId ? byId.get(mappedId) : matches.length === 1 ? matches[0] : undefined;
      if (mappedId && !current) {
        addIssue(row, "sourceKey", "stale_source_key", "Referensi sumber tidak lagi tersedia.");
        continue;
      }
      if (!mappedId && matches.length > 1) {
        addIssue(row, "arabicName", "ambiguous_match", "Nama Arab cocok dengan beberapa mata pelajaran.");
        continue;
      }
      const id = current?.id ?? crypto.randomUUID();
      const same =
        current &&
        current.nama_arab === arabicName &&
        (current.nama_indo ?? null) === indonesianName;
      row.action = same ? "duplicate" : current ? "updated" : "inserted";
      row.payload = { id, arabicName, indonesianName };
      if (!same) writes.push({ id, arabicName, indonesianName });
      keysToAdd.push({ entity_type: entityType, source_key: sourceKey, entity_id: id });
    }
  } else if (entityType === "perizinan") {
    const existing = await readAll<PerizinanRow>(
      db,
      "SELECT id, guru_kode_sumber, guru_nama_sumber, judul, senin, selasa, rabu, kamis, sabtu, minggu, total FROM perizinan",
    );
    const gurus = await readAll<{ id: string; kode: string }>(db, "SELECT id, kode FROM guru");
    const guruByKode = new Map(gurus.map((guru) => [guru.kode, guru.id]));
    const byKode = new Map<string, PerizinanRow>();
    const byJudul = new Map<string, PerizinanRow>();
    for (const existingRow of existing) {
      if (existingRow.guru_kode_sumber) {
        byKode.set(existingRow.guru_kode_sumber, existingRow);
      }
      byJudul.set(existingRow.judul, existingRow);
    }
    for (const row of pending) {
      const sourceKey = rowValue(row, "sourceKey") || null;
      const judul = rowValue(row, "judul");
      const guruId = sourceKey ? (guruByKode.get(sourceKey) ?? null) : null;
      const current = sourceKey ? byKode.get(sourceKey) : byJudul.get(judul);
      if (current && sourceKey && current.guru_kode_sumber !== sourceKey) {
        addIssue(row, "sourceKey", "unique_conflict", "ID sumber guru sudah digunakan oleh data izin lain.");
        continue;
      }
      const id = current?.id ?? crypto.randomUUID();
      const same =
        current &&
        current.guru_id === guruId &&
        current.judul === judul &&
        current.senin === Number.parseInt(rowValue(row, "senin") || "0", 10) &&
        current.selasa === Number.parseInt(rowValue(row, "selasa") || "0", 10) &&
        current.rabu === Number.parseInt(rowValue(row, "rabu") || "0", 10) &&
        current.kamis === Number.parseInt(rowValue(row, "kamis") || "0", 10) &&
        current.sabtu === Number.parseInt(rowValue(row, "sabtu") || "0", 10) &&
        current.minggu === Number.parseInt(rowValue(row, "minggu") || "0", 10) &&
        current.total === Number.parseInt(rowValue(row, "total") || "0", 10);
      row.action = same ? "duplicate" : current ? "updated" : "inserted";
      row.payload = {
        id,
        guruId,
        guruKodeSumber: sourceKey,
        guruNamaSumber: judul,
        judul,
        senin: Number.parseInt(rowValue(row, "senin") || "0", 10),
        selasa: Number.parseInt(rowValue(row, "selasa") || "0", 10),
        rabu: Number.parseInt(rowValue(row, "rabu") || "0", 10),
        kamis: Number.parseInt(rowValue(row, "kamis") || "0", 10),
        sabtu: Number.parseInt(rowValue(row, "sabtu") || "0", 10),
        minggu: Number.parseInt(rowValue(row, "minggu") || "0", 10),
        total: Number.parseInt(rowValue(row, "total") || "0", 10),
      };
      if (!same) writes.push(row.payload);
      if (sourceKey) {
        keysToAdd.push({ entity_type: entityType, source_key: sourceKey, entity_id: id });
      }
    }
  } else if (entityType === "absen") {
    const existing = await readAll<AbsenRow>(db, "SELECT id, tanggal, guru_nama_sumber, rincian_jam FROM absen");
    const gurus = await readAll<{ id: string; nama: string }>(db, "SELECT id, nama FROM guru");
    const guruByName = new Map(gurus.map((guru) => [guru.nama, guru.id]));
    const byKey = new Map<string, AbsenRow>();
    for (const existingRow of existing) {
      byKey.set(`${existingRow.tanggal}|${existingRow.guru_nama_sumber}|${existingRow.rincian_jam ?? ""}`, existingRow);
    }
    for (const row of pending) {
      const namaSumber = rowValue(row, "namaGuru");
      const tanggal = rowValue(row, "tanggal");
      const rincianJam = rowValue(row, "rincianJam") || null;
      const jumlahJam = rowValue(row, "jumlahJam") ? Number.parseInt(rowValue(row, "jumlahJam"), 10) : 0;
      const guruId = guruByName.get(namaSumber) ?? null;
      const current = byKey.get(`${tanggal}|${namaSumber}|${rincianJam ?? ""}`);
      const id = current?.id ?? crypto.randomUUID();
      const same = current && current.guru_nama_sumber === namaSumber && current.rincian_jam === rincianJam;
      row.action = same ? "duplicate" : current ? "updated" : "inserted";
      row.payload = {
        id,
        guruId,
        guruNamaSumber: namaSumber,
        tanggal,
        status: rowValue(row, "status"),
        rincianJam: rincianJam,
        jumlahJam,
        mataPelajaran: rowValue(row, "mataPelajaran") || null,
        keterangan: rowValue(row, "keterangan") || null,
      };
      if (!same) writes.push(row.payload);
    }
  } else if (entityType === "loghapus") {
    const existing = await readAll<LogHapusRow>(db, "SELECT id, waktu_hapus, nama_guru FROM log_hapus");
    const byKey = new Map<string, LogHapusRow>();
    for (const existingRow of existing) {
      byKey.set(`${existingRow.waktu_hapus ?? ""}|${existingRow.nama_guru}`, existingRow);
    }
    for (const row of pending) {
      const namaGuru = rowValue(row, "namaGuru");
      const waktuHapus = rowValue(row, "waktuHapus") || null;
      const current = byKey.get(`${waktuHapus ?? ""}|${namaGuru}`);
      const id = current?.id ?? crypto.randomUUID();
      const same = current && current.nama_guru === namaGuru && current.waktu_hapus === waktuHapus;
      row.action = same ? "duplicate" : current ? "updated" : "inserted";
      row.payload = {
        id,
        waktuHapus,
        waktuInput: rowValue(row, "waktuInput") || null,
        tanggal: rowValue(row, "tanggal") || null,
        tahun: rowValue(row, "tahun") ? Number.parseInt(rowValue(row, "tahun"), 10) : null,
        bulan: rowValue(row, "bulan") || null,
        mingguKe: rowValue(row, "mingguKe") ? Number.parseInt(rowValue(row, "mingguKe"), 10) : null,
        namaGuru,
        status: rowValue(row, "status") || null,
        rincianJam: rowValue(row, "rincianJam") || null,
        jumlahJam: rowValue(row, "jumlahJam") ? Number.parseInt(rowValue(row, "jumlahJam"), 10) : null,
        mataPelajaran: rowValue(row, "mataPelajaran") || null,
        keterangan: rowValue(row, "keterangan") || null,
      };
      if (!same) writes.push(row.payload);
    }
  } else if (entityType === "pengaturan") {
    const existing = await readAll<{ kunci: string; nilai: string }>(db, "SELECT kunci, nilai FROM pengaturan");
    const byKunci = new Map(existing.map((setting) => [setting.kunci, setting]));
    for (const row of pending) {
      const kunci = rowValue(row, "kunci");
      const nilai = rowValue(row, "nilai");
      const current = byKunci.get(kunci);
      row.action = current && current.nilai === nilai ? "duplicate" : current ? "updated" : "inserted";
      row.payload = { id: kunci, kunci, nilai };
      if (row.action !== "duplicate") writes.push(row.payload);
    }
  }
  return { writes, keys: keysToAdd };
}

async function resolveReferences(
  db: D1Database,
  entityType: "guru" | "kelas" | "mapel",
  keys: string[],
): Promise<Map<string, string>> {
  const keyMap = await loadSourceKeys(db, entityType);
  const unresolved = keys.filter((key) => !keyMap.has(key));
  if (unresolved.length > 0) {
    const table = entityType === "guru" ? "guru" : entityType === "kelas" ? "kelas" : "mata_pelajaran";
    const existing = await readAll<{ id: string }>(
      db,
      `SELECT id FROM ${table} WHERE id IN (${placeholders(unresolved.length)})`,
      unresolved,
    );
    const ids = new Set(existing.map((row) => row.id));
    for (const key of unresolved) {
      if (ids.has(key)) keyMap.set(key, key);
    }
  }
  return keyMap;
}

async function analyzeScheduleImport(
  db: D1Database,
  rows: PlannedRow[],
): Promise<Array<Record<string, string | number | null>>> {
  const pending = rows.filter((row) => row.action !== "duplicate" && row.action !== "failed");
  const classKeys = [...new Set(pending.map((row) => rowValue(row, "classKey")))];
  const teacherKeys = [...new Set(pending.map((row) => rowValue(row, "teacherKey")))];
  const subjectKeys = [...new Set(pending.map((row) => rowValue(row, "subjectKey")))];
  const [classMap, teacherMap, subjectMap] = await Promise.all([
    resolveReferences(db, "kelas", classKeys),
    resolveReferences(db, "guru", teacherKeys),
    resolveReferences(db, "mapel", subjectKeys),
  ]);
  const ready: PlannedRow[] = [];

  for (const row of pending) {
    const classId = classMap.get(rowValue(row, "classKey"));
    const teacherId = teacherMap.get(rowValue(row, "teacherKey"));
    const subjectId = subjectMap.get(rowValue(row, "subjectKey"));
    if (!classId) {
      addIssue(row, "classKey", "unknown_reference", "ID sumber kelas belum diimpor atau tidak ditemukan.");
    } else if (!teacherId) {
      addIssue(row, "teacherKey", "unknown_reference", "ID sumber guru belum diimpor atau tidak ditemukan.");
    } else if (!subjectId) {
      addIssue(row, "subjectKey", "unknown_reference", "Key sumber mata pelajaran belum diimpor atau tidak ditemukan.");
    } else {
      row.payload = {
        id: crypto.randomUUID(),
        classId,
        teacherId,
        subjectId,
        dayIndex: row.payload?.dayIndex ?? 0,
        period: row.payload?.period ?? 0,
      };
      ready.push(row);
    }
  }

  const byClassSlot = new Map<string, PlannedRow>();
  const byTeacherSlot = new Map<string, PlannedRow>();
  for (const row of ready) {
    const payload = row.payload!;
    const classSlot = `${payload.classId}:${payload.dayIndex}:${payload.period}`;
    const teacherSlot = `${payload.teacherId}:${payload.dayIndex}:${payload.period}`;
    const sameClass = byClassSlot.get(classSlot);
    const sameTeacher = byTeacherSlot.get(teacherSlot);
    if (sameClass) {
      if (canonicalValue(sameClass) === canonicalValue(row)) {
        row.action = "duplicate";
      } else {
        addIssue(row, null, "duplicate_input_conflict", "Slot kelas berulang dengan isi yang berbeda.");
      }
      continue;
    }
    if (sameTeacher) {
      addIssue(row, "teacherKey", "teacher_slot_conflict", "Guru memiliki jadwal lain pada jam yang sama.");
      continue;
    }
    byClassSlot.set(classSlot, row);
    byTeacherSlot.set(teacherSlot, row);
  }

  const candidates = ready.filter((row) => row.action !== "failed" && row.action !== "duplicate");
  const existingSchedules: JadwalRow[] = [];
  for (let offset = 0; offset < candidates.length; offset += 75) {
    const chunk = candidates.slice(offset, offset + 75);
    if (chunk.length === 0) continue;
    const conditions = chunk
      .map(() => "(kelas_id = ? AND day_index = ? AND period = ?) OR (guru_id = ? AND day_index = ? AND period = ?)")
      .join(" OR ");
    const values = chunk.flatMap((row) => {
      const payload = row.payload!;
      return [
        payload.classId,
        payload.dayIndex,
        payload.period,
        payload.teacherId,
        payload.dayIndex,
        payload.period,
      ];
    });
    existingSchedules.push(
      ...(await readAll<JadwalRow>(
        db,
        `SELECT id, kelas_id, guru_id, mata_pelajaran_id, day_index, period
         FROM jadwal WHERE is_active = 1 AND (${conditions})`,
        values,
      )),
    );
  }

  const slotMap = new Map<string, JadwalRow>();
  const teacherSlotMap = new Map<string, JadwalRow>();
  for (const schedule of existingSchedules) {
    slotMap.set(`${schedule.kelas_id}:${schedule.day_index}:${schedule.period}`, schedule);
    teacherSlotMap.set(`${schedule.guru_id}:${schedule.day_index}:${schedule.period}`, schedule);
  }

  const writes: Array<Record<string, string | number | null>> = [];
  for (const row of candidates) {
    if (row.action === "failed" || row.action === "duplicate") continue;
    const payload = row.payload!;
    const classSlot = `${payload.classId}:${payload.dayIndex}:${payload.period}`;
    const teacherSlot = `${payload.teacherId}:${payload.dayIndex}:${payload.period}`;
    const current = slotMap.get(classSlot);
    const teacherConflict = teacherSlotMap.get(teacherSlot);
    if (teacherConflict && teacherConflict.id !== current?.id) {
      addIssue(row, "teacherKey", "teacher_slot_conflict", "Guru memiliki jadwal lain pada jam yang sama.");
      continue;
    }

    const same =
      current &&
      current.guru_id === payload.teacherId &&
      current.mata_pelajaran_id === payload.subjectId;
    row.action = same ? "duplicate" : current ? "updated" : "inserted";
    if (!same) {
      writes.push({
        id: current?.id ?? payload.id!,
        classId: payload.classId!,
        teacherId: payload.teacherId!,
        subjectId: payload.subjectId!,
        dayIndex: payload.dayIndex!,
        period: payload.period!,
      });
    }
  }
  return writes;
}

async function makePlan(
  db: D1Database,
  workbook: ReturnType<typeof readWorkbook>,
  sheetName: string,
  entityType: ImportEntityType,
  mapping: ImportMapping,
): Promise<ImportPlan> {
  const rows = buildRows(workbook, sheetName, entityType, mapping);
  let entityWrites: Array<Record<string, string | number | null>> = [];
  let sourceKeyWrites: ImportPlan["sourceKeyWrites"] = [];
  if (entityType === "jadwal") {
    entityWrites = await analyzeScheduleImport(db, rows);
  } else {
    const result = await analyzeMasterImport(db, rows, entityType);
    entityWrites = result.writes;
    sourceKeyWrites = result.keys;
  }
  const issues = rows.flatMap((row) => (row.issue ? [row.issue] : []));
  return {
    entityType,
    rows,
    issues,
    summary: summarize(rows),
    entityWrites,
    sourceKeyWrites,
    mapping,
  };
}

function responseForPlan(plan: ImportPlan): ImportResponse {
  return { summary: plan.summary, issues: plan.issues };
}

function prepareWriteStatements(
  db: D1Database,
  plan: ImportPlan,
  runId: string,
  uploadedBy: string,
  fileName: string,
  fileHash: string,
  sheetName: string,
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  const status =
    plan.summary.failed === 0
      ? "completed"
      : plan.summary.inserted + plan.summary.updated + plan.summary.duplicates > 0
        ? "partial"
        : "failed";
  const summaryJson = JSON.stringify(plan.summary);

  statements.push(
    db
      .prepare(
        `INSERT INTO import_runs (
           id, file_name, file_hash, sheet_name, entity_type, uploaded_by, status,
           total_rows, inserted_count, updated_count, duplicate_count, failed_count, mapping_json
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        runId,
        fileName,
        fileHash,
        sheetName,
        plan.entityType,
        uploadedBy,
        status,
        plan.summary.totalRows,
        plan.summary.inserted,
        plan.summary.updated,
        plan.summary.duplicates,
        plan.summary.failed,
        JSON.stringify(plan.mapping),
      ),
  );

  if (plan.entityWrites.length > 0) {
    const json = JSON.stringify(plan.entityWrites);
    if (plan.entityType === "guru") {
      statements.push(
        db
          .prepare(
            `INSERT INTO guru (id, kode, nama, is_active)
             SELECT json_extract(value, '$.id'), json_extract(value, '$.code'),
                    json_extract(value, '$.name'), 1
             FROM json_each(?) WHERE 1
             ON CONFLICT(id) DO UPDATE SET
               kode = excluded.kode, nama = excluded.nama, updated_at = CURRENT_TIMESTAMP`,
          )
          .bind(json),
      );
    } else if (plan.entityType === "kelas") {
      statements.push(
        db
          .prepare(
            `INSERT INTO kelas (id, nama, is_active)
             SELECT json_extract(value, '$.id'), json_extract(value, '$.name'), 1
             FROM json_each(?) WHERE 1
             ON CONFLICT(id) DO UPDATE SET
               nama = excluded.nama, updated_at = CURRENT_TIMESTAMP`,
          )
          .bind(json),
      );
    } else if (plan.entityType === "mapel") {
      statements.push(
        db
          .prepare(
            `INSERT INTO mata_pelajaran (id, nama_arab, nama_indo, is_active)
             SELECT json_extract(value, '$.id'), json_extract(value, '$.arabicName'),
                    json_extract(value, '$.indonesianName'), 1
             FROM json_each(?) WHERE 1
             ON CONFLICT(id) DO UPDATE SET
               nama_arab = excluded.nama_arab, nama_indo = excluded.nama_indo,
               updated_at = CURRENT_TIMESTAMP`,
          )
          .bind(json),
      );
    } else if (plan.entityType === "perizinan") {
      statements.push(
        db
          .prepare(
            `INSERT INTO perizinan (
               id, guru_id, guru_kode_sumber, guru_nama_sumber, judul,
               senin, selasa, rabu, kamis, sabtu, minggu, total,
               created_at, updated_at
             )
             SELECT json_extract(value, '$.id'), json_extract(value, '$.guruId'),
                    json_extract(value, '$.guruKodeSumber'), json_extract(value, '$.guruNamaSumber'),
                    json_extract(value, '$.judul'), json_extract(value, '$.senin'),
                    json_extract(value, '$.selasa'), json_extract(value, '$.rabu'),
                    json_extract(value, '$.kamis'), json_extract(value, '$.sabtu'),
                    json_extract(value, '$.minggu'), json_extract(value, '$.total'),
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
             FROM json_each(?) WHERE 1
             ON CONFLICT(id) DO UPDATE SET
               guru_id = excluded.guru_id,
               guru_kode_sumber = excluded.guru_kode_sumber,
               guru_nama_sumber = excluded.guru_nama_sumber,
               judul = excluded.judul,
               senin = excluded.senin, selasa = excluded.selasa, rabu = excluded.rabu,
               kamis = excluded.kamis, sabtu = excluded.sabtu, minggu = excluded.minggu,
               total = excluded.total, updated_at = CURRENT_TIMESTAMP`,
          )
          .bind(json),
      );
    } else if (plan.entityType === "absen") {
      statements.push(
        db
          .prepare(
            `INSERT INTO absen (
               id, guru_id, guru_nama_sumber, tanggal, status, rincian_jam,
               jumlah_jam, mata_pelajaran, keterangan, created_at, updated_at
             )
             SELECT json_extract(value, '$.id'), json_extract(value, '$.guruId'),
                    json_extract(value, '$.guruNamaSumber'), json_extract(value, '$.tanggal'),
                    json_extract(value, '$.status'), json_extract(value, '$.rincianJam'),
                    json_extract(value, '$.jumlahJam'), json_extract(value, '$.mataPelajaran'),
                    json_extract(value, '$.keterangan'), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
             FROM json_each(?) WHERE 1
             ON CONFLICT(id) DO UPDATE SET
               guru_id = excluded.guru_id,
               guru_nama_sumber = excluded.guru_nama_sumber,
               status = excluded.status, rincian_jam = excluded.rincian_jam,
               jumlah_jam = excluded.jumlah_jam, mata_pelajaran = excluded.mata_pelajaran,
               keterangan = excluded.keterangan, updated_at = CURRENT_TIMESTAMP`,
          )
          .bind(json),
      );
    } else if (plan.entityType === "loghapus") {
      statements.push(
        db
          .prepare(
            `INSERT INTO log_hapus (
               id, waktu_hapus, waktu_input, tanggal, tahun, bulan, minggu_ke,
               nama_guru, status, rincian_jam, jumlah_jam, mata_pelajaran,
               keterangan, created_at
             )
             SELECT json_extract(value, '$.id'), json_extract(value, '$.waktuHapus'),
                    json_extract(value, '$.waktuInput'), json_extract(value, '$.tanggal'),
                    json_extract(value, '$.tahun'), json_extract(value, '$.bulan'),
                    json_extract(value, '$.mingguKe'), json_extract(value, '$.namaGuru'),
                    json_extract(value, '$.status'), json_extract(value, '$.rincianJam'),
                    json_extract(value, '$.jumlahJam'), json_extract(value, '$.mataPelajaran'),
                    json_extract(value, '$.keterangan'), CURRENT_TIMESTAMP
             FROM json_each(?) WHERE 1
             ON CONFLICT(id) DO UPDATE SET
               waktu_input = excluded.waktu_input,
               tanggal = excluded.tanggal, tahun = excluded.tahun, bulan = excluded.bulan,
               minggu_ke = excluded.minggu_ke, nama_guru = excluded.nama_guru,
               status = excluded.status, rincian_jam = excluded.rincian_jam,
               jumlah_jam = excluded.jumlah_jam, mata_pelajaran = excluded.mata_pelajaran,
               keterangan = excluded.keterangan`,
          )
          .bind(json),
      );
    } else if (plan.entityType === "pengaturan") {
      statements.push(
        db
          .prepare(
            `INSERT INTO pengaturan (kunci, nilai, updated_at)
             SELECT json_extract(value, '$.kunci'), json_extract(value, '$.nilai'),
                    CURRENT_TIMESTAMP
             FROM json_each(?) WHERE 1
             ON CONFLICT(kunci) DO UPDATE SET
               nilai = excluded.nilai, updated_at = CURRENT_TIMESTAMP`,
          )
          .bind(json),
      );
    } else {
      statements.push(
        db
          .prepare(
            `INSERT INTO jadwal (
               id, kelas_id, guru_id, mata_pelajaran_id, day_index, period, is_active
             )
             SELECT json_extract(value, '$.id'), json_extract(value, '$.classId'),
                    json_extract(value, '$.teacherId'), json_extract(value, '$.subjectId'),
                    json_extract(value, '$.dayIndex'), json_extract(value, '$.period'), 1
             FROM json_each(?) WHERE 1
             ON CONFLICT(kelas_id, day_index, period) WHERE is_active = 1 DO UPDATE SET
               guru_id = excluded.guru_id,
               mata_pelajaran_id = excluded.mata_pelajaran_id,
               updated_at = CURRENT_TIMESTAMP`,
          )
          .bind(json),
      );
    }
  }

  if (plan.sourceKeyWrites.length > 0) {
    statements.push(
      db
        .prepare(
          `INSERT INTO import_source_keys (entity_type, source_key, entity_id)
           SELECT json_extract(value, '$.entity_type'), json_extract(value, '$.source_key'),
                  json_extract(value, '$.entity_id')
           FROM json_each(?) WHERE 1
           ON CONFLICT(entity_type, source_key) DO UPDATE SET
             entity_id = excluded.entity_id, updated_at = CURRENT_TIMESTAMP`,
        )
        .bind(JSON.stringify(plan.sourceKeyWrites)),
    );
  }

  if (plan.issues.length > 0) {
    const errors = plan.issues.map((issue) => ({
      id: crypto.randomUUID(),
      row: issue.row,
      column: issue.column,
      code: issue.code,
      message: issue.message,
    }));
    statements.push(
      db
        .prepare(
          `INSERT INTO import_run_errors (
             id, import_run_id, row_number, column_key, error_code, message
           )
           SELECT json_extract(value, '$.id'), ?, json_extract(value, '$.row'),
                  json_extract(value, '$.column'), json_extract(value, '$.code'),
                  json_extract(value, '$.message')
           FROM json_each(?)`,
        )
        .bind(runId, JSON.stringify(errors)),
    );
  }

  statements.push(
    db
      .prepare(
        `INSERT INTO audit_logs (id, actor_user_id, action, entity_type, entity_id, after_json)
         VALUES (?, ?, 'IMPORT', 'excel_import', ?, ?)`,
      )
      .bind(crypto.randomUUID(), uploadedBy, runId, summaryJson),
  );
  return statements;
}

imports.post("/inspect", async (c) => {
  try {
    const upload = await readUpload(c);
    return c.json({
      file: {
        name: upload.fileName,
        size: upload.bytes.byteLength,
        sheetCount: upload.workbook.SheetNames.length,
      },
      sheets: inspectWorkbook(upload.workbook),
    });
  } catch (error: unknown) {
    if (error instanceof ExcelImportError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400);
    }
    console.error("Excel workbook inspection failed.");
    return c.json({ error: "File belum dapat diperiksa. Periksa file lalu coba lagi." }, 500);
  }
});

imports.post("/validate", async (c) => {
  try {
    const upload = await readUpload(c);
    const selected = readSelectedSheet(upload.form);
    const plan = await makePlan(
      c.env.DB,
      upload.workbook,
      selected.sheetName,
      selected.entityType,
      selected.mapping,
    );
    return c.json(responseForPlan(plan));
  } catch (error: unknown) {
    if (error instanceof ExcelImportError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400);
    }
    console.error("Excel workbook validation failed.", error instanceof Error ? error.message : String(error));
    return c.json({ error: "Data belum dapat divalidasi. Periksa pemetaan dan coba lagi." }, 500);
  }
});

imports.post("/commit", async (c) => {
  try {
    const upload = await readUpload(c);
    const selected = readSelectedSheet(upload.form);
    const plan = await makePlan(
      c.env.DB,
      upload.workbook,
      selected.sheetName,
      selected.entityType,
      selected.mapping,
    );
    const runId = crypto.randomUUID();
    await c.env.DB.batch(
      prepareWriteStatements(
        c.env.DB,
        plan,
        runId,
        c.get("authUser").id,
        upload.fileName,
        upload.fileHash,
        selected.sheetName,
      ),
    );
    return c.json({ id: runId, ...responseForPlan(plan) }, 201);
  } catch (error: unknown) {
    if (error instanceof ExcelImportError) {
      return c.json({ error: error.message, code: error.code }, error.status as 400);
    }
    console.error("Excel workbook import transaction failed.");
    return c.json({ error: "Import tidak berhasil disimpan. Data tidak diubah." }, 500);
  }
});

imports.get("/", async (c) => {
  const page = parsePage(c.req.query("page"), 1);
  const perPage = parsePage(c.req.query("per_page"), 20);
  if (page === null || perPage === null || perPage > MAX_PAGE_SIZE) {
    return c.json({ error: "Parameter halaman tidak valid." }, 400);
  }

  try {
    const count = await c.env.DB.prepare("SELECT COUNT(*) AS total FROM import_runs")
      .first<{ total: number }>();
    const total = count?.total ?? 0;
    const data = await readAll<{
      id: string;
      file_name: string;
      sheet_name: string;
      entity_type: ImportEntityType;
      status: string;
      total_rows: number;
      inserted_count: number;
      updated_count: number;
      duplicate_count: number;
      failed_count: number;
      created_at: string;
      uploader: string;
    }>(
      c.env.DB,
      `SELECT r.id, r.file_name, r.sheet_name, r.entity_type, r.status, r.total_rows,
              r.inserted_count, r.updated_count, r.duplicate_count, r.failed_count,
              r.created_at, u.username AS uploader
       FROM import_runs r JOIN users u ON u.id = r.uploaded_by
       ORDER BY r.created_at DESC, r.id DESC
       LIMIT ? OFFSET ?`,
      [perPage, (page - 1) * perPage],
    );
    return c.json({
      data,
      pagination: {
        page,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      },
    });
  } catch {
    console.error("Excel import history query failed.");
    return c.json({ error: "Riwayat import belum dapat dimuat." }, 500);
  }
});

imports.get("/:id", async (c) => {
  const id = c.req.param("id");
  if (!id || id.length > 128 || controlCharacters.test(id)) {
    return c.json({ error: "Riwayat import tidak ditemukan." }, 404);
  }
  try {
    const run = await c.env.DB.prepare(
      `SELECT r.id, r.file_name, r.sheet_name, r.entity_type, r.status, r.total_rows,
              r.inserted_count, r.updated_count, r.duplicate_count, r.failed_count,
              r.mapping_json, r.created_at, u.username AS uploader
       FROM import_runs r JOIN users u ON u.id = r.uploaded_by
       WHERE r.id = ? LIMIT 1`,
    )
      .bind(id)
      .first();
    if (!run) {
      return c.json({ error: "Riwayat import tidak ditemukan." }, 404);
    }
    const errors = await readAll<ImportIssue & { column_key: string | null; row_number: number }>(
      c.env.DB,
      `SELECT row_number AS row, column_key AS column, error_code AS code, message
       FROM import_run_errors WHERE import_run_id = ? ORDER BY row_number, id`,
      [id],
    );
    return c.json({ data: run, errors });
  } catch {
    console.error("Excel import detail query failed.");
    return c.json({ error: "Detail riwayat import belum dapat dimuat." }, 500);
  }
});

export default imports;
