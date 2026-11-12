-- =========================================================
-- NIDHOM
-- Migration 0004: Permission & Absence Data from Source Workbook
-- =========================================================
-- Sumber data: docs/source-data/sistem perizinan.xlsx
-- Sheet1 (127 rekap izin per guru) -> tabel perizinan
-- Absen (69 catatan izin/sakit/ghaib bertanggal) -> tabel absen
-- LogHapus (3 catatan penghapusan) -> tabel log_hapus

-- 1. REKAP IZIN PER GURU (Sheet1)
CREATE TABLE perizinan (
    id TEXT PRIMARY KEY,
    guru_id TEXT REFERENCES guru(id) ON DELETE RESTRICT,
    guru_kode_sumber TEXT,
    guru_nama_sumber TEXT NOT NULL
        CHECK (length(trim(guru_nama_sumber)) > 0),
    judul TEXT NOT NULL
        CHECK (length(trim(judul)) > 0),
    senin INTEGER NOT NULL DEFAULT 0 CHECK (senin >= 0),
    selasa INTEGER NOT NULL DEFAULT 0 CHECK (selasa >= 0),
    rabu INTEGER NOT NULL DEFAULT 0 CHECK (rabu >= 0),
    kamis INTEGER NOT NULL DEFAULT 0 CHECK (kamis >= 0),
    sabtu INTEGER NOT NULL DEFAULT 0 CHECK (sabtu >= 0),
    minggu INTEGER NOT NULL DEFAULT 0 CHECK (minggu >= 0),
    total INTEGER NOT NULL DEFAULT 0 CHECK (total >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_perizinan_guru ON perizinan(guru_id);
CREATE INDEX idx_perizinan_kode_sumber ON perizinan(guru_kode_sumber);
CREATE UNIQUE INDEX idx_perizinan_kode_sumber_unik ON perizinan(guru_kode_sumber)
    WHERE guru_kode_sumber IS NOT NULL;

-- 2. CATATAN IZIN / KEHADIRAN BERPISAK (Absen)
CREATE TABLE absen (
    id TEXT PRIMARY KEY,
    guru_id TEXT REFERENCES guru(id) ON DELETE RESTRICT,
    guru_nama_sumber TEXT NOT NULL
        CHECK (length(trim(guru_nama_sumber)) > 0),
    tanggal TEXT NOT NULL
        CHECK (length(trim(tanggal)) > 0),
    status TEXT NOT NULL
        CHECK (trim(status) IN ('Izin', 'Sakit', 'Ghaib')),
    rincian_jam TEXT,
    jumlah_jam INTEGER NOT NULL DEFAULT 0 CHECK (jumlah_jam >= 0),
    mata_pelajaran TEXT,
    keterangan TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_absen_tanggal ON absen(tanggal);
CREATE INDEX idx_absen_status ON absen(status);
CREATE INDEX idx_absen_guru ON absen(guru_id);
CREATE UNIQUE INDEX idx_absen_unik ON absen(tanggal, guru_nama_sumber, rincian_jam);

-- 3. CATATAN PENGHAPUSAN (LogHapus)
CREATE TABLE log_hapus (
    id TEXT PRIMARY KEY,
    waktu_hapus TEXT,
    waktu_input TEXT,
    tanggal TEXT,
    tahun INTEGER,
    bulan TEXT,
    minggu_ke INTEGER,
    nama_guru TEXT NOT NULL CHECK (length(trim(nama_guru)) > 0),
    status TEXT,
    rincian_jam TEXT,
    jumlah_jam INTEGER,
    mata_pelajaran TEXT,
    keterangan TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_log_hapus_tanggal ON log_hapus(tanggal);
CREATE UNIQUE INDEX idx_log_hapus_unik ON log_hapus(waktu_hapus, nama_guru);

-- Migration number: 0004 \t 2026-11-07T00:00:00.000Z
