import * as XLSX from "xlsx";

export type ImportEntityType =
  | "guru"
  | "kelas"
  | "mapel"
  | "jadwal"
  | "perizinan"
  | "absen"
  | "loghapus"
  | "pengaturan";

export interface ImportField {
  key: string;
  label: string;
  required: boolean;
}

export interface ImportMapping {
  [field: string]: string;
}

export interface ImportIssue {
  row: number;
  column: string | null;
  code: string;
  message: string;
}

export interface ImportRecord {
  row: number;
  values: Record<string, string>;
}

export class ExcelImportError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ExcelImportError";
  }
}

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 16 * 1024 * 1024;
const MAX_SHEETS = 20;
export const MAX_IMPORT_ROWS = 450;
const MAX_COLUMNS = 64;

const fieldDefinitions: Record<ImportEntityType, ImportField[]> = {
  guru: [
    { key: "sourceKey", label: "ID sumber guru", required: true },
    { key: "code", label: "Kode guru", required: true },
    { key: "name", label: "Nama guru", required: true },
  ],
  kelas: [
    { key: "sourceKey", label: "ID sumber kelas", required: true },
    { key: "name", label: "Nama kelas", required: true },
  ],
  mapel: [
    { key: "sourceKey", label: "Key sumber mapel", required: true },
    { key: "arabicName", label: "Nama Arab", required: true },
    { key: "indonesianName", label: "Keterangan Indonesia", required: false },
  ],
  jadwal: [
    { key: "classKey", label: "ID sumber kelas", required: true },
    { key: "period", label: "Jam atau periode", required: true },
    { key: "dayIndex", label: "Indeks hari", required: true },
    { key: "subjectKey", label: "Key sumber mata pelajaran", required: true },
    { key: "teacherKey", label: "ID sumber guru", required: true },
  ],
  perizinan: [
    { key: "sourceKey", label: "ID sumber guru", required: false },
    { key: "judul", label: "Judul permohonan", required: true },
    { key: "senin", label: "Senin", required: false },
    { key: "selasa", label: "Selasa", required: false },
    { key: "rabu", label: "Rabu", required: false },
    { key: "kamis", label: "Kamis", required: false },
    { key: "sabtu", label: "Sabtu", required: false },
    { key: "minggu", label: "Minggu (Ahad)", required: false },
    { key: "total", label: "Total", required: false },
  ],
  absen: [
    { key: "namaGuru", label: "Nama guru", required: true },
    { key: "tanggal", label: "Tanggal", required: true },
    { key: "status", label: "Status", required: true },
    { key: "rincianJam", label: "Rincian jam", required: false },
    { key: "jumlahJam", label: "Jumlah jam", required: false },
    { key: "mataPelajaran", label: "Mata pelajaran", required: false },
    { key: "keterangan", label: "Keterangan", required: false },
  ],
  loghapus: [
    { key: "waktuHapus", label: "Waktu hapus", required: false },
    { key: "waktuInput", label: "Waktu input", required: false },
    { key: "tanggal", label: "Tanggal", required: false },
    { key: "tahun", label: "Tahun", required: false },
    { key: "bulan", label: "Bulan", required: false },
    { key: "mingguKe", label: "Minggu ke", required: false },
    { key: "namaGuru", label: "Nama guru", required: true },
    { key: "status", label: "Status", required: false },
    { key: "rincianJam", label: "Rincian jam", required: false },
    { key: "jumlahJam", label: "Jumlah jam", required: false },
    { key: "mataPelajaran", label: "Mata pelajaran", required: false },
    { key: "keterangan", label: "Keterangan", required: false },
  ],
  pengaturan: [
    { key: "kunci", label: "Kunci", required: true },
    { key: "nilai", label: "Nilai", required: true },
  ],
};

const aliases: Record<ImportEntityType, Record<string, string[]>> = {
  guru: {
    sourceKey: ["idguru", "id", "guruid"],
    code: ["kode", "kodeguru", "code"],
    name: ["nama", "namaguru", "name"],
  },
  kelas: {
    sourceKey: ["idkelas", "id", "classid"],
    name: ["nama", "namakelas", "kelas", "classname"],
  },
  mapel: {
    sourceKey: ["keymapel", "idmapel", "id", "subjectkey"],
    arabicName: ["namaarab", "arabicname"],
    indonesianName: ["ketindo", "namaindo", "namaindonesia", "indonesianname"],
  },
  jadwal: {
    classKey: ["idkelas", "classid", "classkey"],
    period: ["jam", "periode", "period", "slot"],
    dayIndex: ["hariidx", "hariindex", "dayindex", "hari"],
    subjectKey: ["keymapel", "idmapel", "mapelkey", "subjectkey"],
    teacherKey: ["idguru", "guruid", "teacherkey"],
  },
  perizinan: {
    sourceKey: ["id"],
    judul: ["nama", "judul", "keterangan"],
    senin: ["senin"],
    selasa: ["selasa"],
    rabu: ["rabu", "rabo"],
    kamis: ["kamis"],
    sabtu: ["sabtu"],
    minggu: ["minggu", "ahad"],
    total: ["total"],
  },
  absen: {
    namaGuru: ["namaguru", "namaguru", "namaguru", "nama guru", "namaguru", "guru"],
    tanggal: ["tanggal"],
    status: ["status"],
    rincianJam: ["rincianjam", "rincianjamke", "rincian jam", "rincian jam ke", "rincian"],
    jumlahJam: ["jumlahjam", "jumlah jam", "jumlah"],
    mataPelajaran: ["matapelajaran", "mata pelajaran", "mapel"],
    keterangan: ["keterangan", "keterangan"],
  },
  loghapus: {
    waktuHapus: ["waktuhapus", "waktu hapus"],
    waktuInput: ["waktuinput", "waktu input"],
    tanggal: ["tanggal"],
    tahun: ["tahun"],
    bulan: ["bulan"],
    mingguKe: ["mingguke", "minggu ke"],
    namaGuru: ["namaguru", "nama guru", "guru"],
    status: ["status"],
    rincianJam: ["rincianjam", "rincian jam", "rincian"],
    jumlahJam: ["jumlahjam", "jumlah jam", "jumlah"],
    mataPelajaran: ["matapelajaran", "mata pelajaran", "mapel"],
    keterangan: ["keterangan", "keterangan"],
  },
  pengaturan: {
    kunci: ["kunci"],
    nilai: ["nilai"],
  },
};

function normalizeHeader(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function isNonEmpty(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== "";
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value).trim();
}

function sheetHidden(workbook: XLSX.WorkBook, name: string): boolean {
  return Boolean(workbook.Workbook?.Sheets?.find((sheet) => sheet.name === name)?.Hidden);
}

function validateZipBounds(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const searchStart = Math.max(0, bytes.byteLength - 65_557);
  let endOffset = -1;

  for (let offset = bytes.byteLength - 22; offset >= searchStart; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }

  if (endOffset < 0) {
    throw new ExcelImportError(400, "invalid_workbook", "File Excel tidak dapat dibaca.");
  }

  const entryCount = view.getUint16(endOffset + 10, true);
  const directorySize = view.getUint32(endOffset + 12, true);
  let offset = view.getUint32(endOffset + 16, true);
  if (
    entryCount === 0xffff ||
    entryCount > 256 ||
    directorySize > bytes.byteLength ||
    offset + directorySize > endOffset
  ) {
    throw new ExcelImportError(400, "workbook_too_complex", "Struktur workbook terlalu besar.");
  }

  let totalUncompressed = 0;
  for (let entry = 0; entry < entryCount; entry += 1) {
    if (offset + 46 > bytes.byteLength || view.getUint32(offset, true) !== 0x02014b50) {
      throw new ExcelImportError(400, "invalid_workbook", "File Excel tidak dapat dibaca.");
    }

    const compressedSize = view.getUint32(offset + 20, true);
    const uncompressedSize = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const entryLength = 46 + nameLength + extraLength + commentLength;

    if (
      offset + entryLength > bytes.byteLength ||
      uncompressedSize === 0xffffffff ||
      uncompressedSize > MAX_UNCOMPRESSED_BYTES ||
      (compressedSize === 0 && uncompressedSize > 0) ||
      (compressedSize > 0 && uncompressedSize / compressedSize > 100)
    ) {
      throw new ExcelImportError(400, "workbook_too_complex", "Struktur workbook terlalu besar.");
    }

    totalUncompressed += uncompressedSize;
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) {
      throw new ExcelImportError(400, "workbook_too_complex", "Struktur workbook terlalu besar.");
    }
    offset += entryLength;
  }
}

export function validateWorkbookFile(
  fileName: string,
  contentType: string,
  bytes: Uint8Array,
): { safeFileName: string; extension: "xls" | "xlsx" } {
  const safeFileName = fileName
    .replace(/^.*[\\/]/, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 180);
  const extension = safeFileName.split(".").pop()?.toLowerCase();

  if (!safeFileName || (extension !== "xls" && extension !== "xlsx")) {
    throw new ExcelImportError(415, "unsupported_file_type", "Pilih file .xls atau .xlsx.");
  }
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_FILE_BYTES) {
    throw new ExcelImportError(413, "file_size_limit", "Ukuran file maksimal 2 MB.");
  }

  const isXlsx = extension === "xlsx";
  const signatureMatches = isXlsx
    ? bytes[0] === 0x50 && bytes[1] === 0x4b
    : bytes.length >= 8 &&
      bytes[0] === 0xd0 &&
      bytes[1] === 0xcf &&
      bytes[2] === 0x11 &&
      bytes[3] === 0xe0 &&
      bytes[4] === 0xa1 &&
      bytes[5] === 0xb1 &&
      bytes[6] === 0x1a &&
      bytes[7] === 0xe1;
  const normalizedType = contentType.split(";", 1)[0].trim().toLowerCase();
  const allowedTypes = isXlsx
    ? [
        "",
        "application/octet-stream",
        "application/zip",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ]
    : ["", "application/octet-stream", "application/vnd.ms-excel"];

  if (!signatureMatches || !allowedTypes.includes(normalizedType)) {
    throw new ExcelImportError(415, "file_signature_mismatch", "Format file tidak sesuai ekstensi.");
  }
  if (isXlsx) {
    validateZipBounds(bytes);
  }

  return { safeFileName, extension };
}

export function readWorkbook(bytes: Uint8Array): XLSX.WorkBook {
  try {
    const workbook = XLSX.read(bytes, {
      type: "array",
      cellDates: false,
      cellFormula: true,
    });
    if (workbook.SheetNames.length === 0 || workbook.SheetNames.length > MAX_SHEETS) {
      throw new ExcelImportError(400, "sheet_count_limit", "Jumlah sheet tidak didukung.");
    }
    return workbook;
  } catch (error: unknown) {
    if (error instanceof ExcelImportError) {
      throw error;
    }
    throw new ExcelImportError(400, "invalid_workbook", "File Excel tidak dapat dibaca.");
  }
}

export function getImportFields(entityType: ImportEntityType): ImportField[] {
  return fieldDefinitions[entityType];
}

export function isImportEntityType(value: string): value is ImportEntityType {
  return (
    value === "guru" ||
    value === "kelas" ||
    value === "mapel" ||
    value === "jadwal" ||
    value === "perizinan" ||
    value === "absen" ||
    value === "loghapus" ||
    value === "pengaturan"
  );
}

export function detectEntityType(sheetName: string, headers: string[]): ImportEntityType {
  const name = normalizeHeader(sheetName);
  const normalizedHeaders = headers.map(normalizeHeader);
  if (
    name.includes("jadwal") ||
    (normalizedHeaders.includes("idkelas") && normalizedHeaders.includes("hariidx"))
  ) {
    return "jadwal";
  }
  if (
    name.includes("guru") ||
    (normalizedHeaders.includes("kode") && normalizedHeaders.includes("nama"))
  ) {
    return "guru";
  }
  if (name.includes("kelas") || normalizedHeaders.includes("namakelas")) {
    return "kelas";
  }
  const has = (candidates: string[]) => candidates.some((candidate) => normalizedHeaders.includes(candidate));
  if (has(["id"]) && has(["nama"]) && (has(["rabu"]) || has(["rabo"]))) {
    return "perizinan";
  }
  if (has(["waktuhapus"])) {
    return "loghapus";
  }
  if (has(["tanggal"]) && has(["status"]) && has(["namaguru"])) {
    return "absen";
  }
  if (has(["kunci"]) && has(["nilai"])) {
    return "pengaturan";
  }
  return "mapel";
}

export function suggestMapping(
  entityType: ImportEntityType,
  headers: string[],
): ImportMapping {
  const normalized = headers.map(normalizeHeader);
  const result: ImportMapping = {};
  for (const field of fieldDefinitions[entityType]) {
    const candidates = aliases[entityType][field.key] ?? [];
    const index = normalized.findIndex((header) => candidates.includes(header));
    result[field.key] = index >= 0 ? headers[index] : "";
  }
  return result;
}

export interface WorkbookSheetPreview {
  name: string;
  hidden: boolean;
  rowCount: number;
  headers: string[];
  suggestedEntityType: ImportEntityType;
  suggestedMapping: ImportMapping;
  previewRows: Array<{ row: number; cells: string[] }>;
  overLimit: boolean;
}

export function inspectWorkbook(workbook: XLSX.WorkBook): WorkbookSheetPreview[] {
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name];
    const grid = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: true,
    }) as unknown[][];
    const headers = (grid[0] ?? []).slice(0, MAX_COLUMNS).map(cellText);
    const entityType = detectEntityType(name, headers);
    const dataRows = grid.slice(1).filter((row) => row.some(isNonEmpty));
    const rowCount = dataRows.length;
    const overLimit = rowCount > MAX_IMPORT_ROWS;
    const previewRows = dataRows
      .map((row, index) => ({ row: index + 2, cells: row.slice(0, MAX_COLUMNS).map(cellText) }))
      .slice(0, 8);

    return {
      name,
      hidden: sheetHidden(workbook, name),
      rowCount,
      headers,
      suggestedEntityType: entityType,
      suggestedMapping: suggestMapping(entityType, headers),
      previewRows,
      overLimit,
    };
  });
}

export interface NormalizedWorkbookRows {
  headers: string[];
  records: ImportRecord[];
}

export function normalizeSheetRows(
  workbook: XLSX.WorkBook,
  sheetName: string,
  entityType: ImportEntityType,
  mapping: ImportMapping,
): NormalizedWorkbookRows {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet || sheetHidden(workbook, sheetName)) {
    throw new ExcelImportError(400, "sheet_unavailable", "Sheet yang dipilih tidak tersedia.");
  }

  const grid = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
    blankrows: true,
  }) as unknown[][];
  const headers = (grid[0] ?? []).slice(0, MAX_COLUMNS).map(cellText);
  if (headers.length === 0 || headers.every((header) => !header)) {
    throw new ExcelImportError(400, "header_required", "Baris pertama harus berisi nama kolom.");
  }
  if (headers.length > MAX_COLUMNS) {
    throw new ExcelImportError(413, "column_limit", `Sheet maksimal ${MAX_COLUMNS} kolom.`);
  }

  const headerKeys = headers.map(normalizeHeader).filter(Boolean);
  if (new Set(headerKeys).size !== headerKeys.length) {
    throw new ExcelImportError(400, "duplicate_headers", "Nama kolom harus unik.");
  }

  const fields = fieldDefinitions[entityType];
  const validKeys = new Set(fields.map((field) => field.key));
  const selectedHeaders = new Set<string>();
  for (const [key, header] of Object.entries(mapping)) {
    if (!validKeys.has(key) || typeof header !== "string") {
      throw new ExcelImportError(400, "invalid_mapping", "Pemetaan kolom tidak valid.");
    }
    if (header && !headers.includes(header)) {
      throw new ExcelImportError(400, "invalid_mapping", "Kolom yang dipetakan tidak ditemukan.");
    }
    if (header && selectedHeaders.has(header)) {
      throw new ExcelImportError(400, "duplicate_mapping", "Satu kolom tidak dapat dipakai dua kali.");
    }
    if (header) {
      selectedHeaders.add(header);
    }
  }

  for (const field of fields) {
    if (field.required && !mapping[field.key]) {
      throw new ExcelImportError(
        400,
        "required_mapping",
        `Pilih kolom untuk ${field.label.toLowerCase()}.`,
      );
    }
  }

  const columnIndexes = new Map<string, number>();
  for (const field of fields) {
    const header = mapping[field.key];
    if (header) {
      columnIndexes.set(field.key, headers.indexOf(header));
    }
  }

  const records: ImportRecord[] = [];
  for (let index = 1; index < grid.length; index += 1) {
    const row = grid[index] ?? [];
    if (!row.some(isNonEmpty)) {
      continue;
    }

    const values: Record<string, string> = {};
    for (const [key, columnIndex] of columnIndexes) {
      const cellAddress = XLSX.utils.encode_cell({ r: index, c: columnIndex });
      const cell = sheet[cellAddress] as XLSX.CellObject | undefined;
      if (cell?.f) {
        continue;
      }
      values[key] = cellText(row[columnIndex]);
    }
    records.push({ row: index + 1, values });
  }

  if (records.length > MAX_IMPORT_ROWS) {
    throw new ExcelImportError(
      413,
      "row_limit",
      `Sheet melebihi batas ${MAX_IMPORT_ROWS} baris data.`,
    );
  }

  return { headers, records };
}

export async function hashWorkbook(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
