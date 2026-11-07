
-- =========================================================
-- NIDHOM TEACHER MANAGEMENT SYSTEM
-- Migration 0001: Initial Core Schema
-- =========================================================

-- 1. MASTER GURU
CREATE TABLE guru (
    id TEXT PRIMARY KEY,
    kode TEXT NOT NULL UNIQUE,
    nama TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. MASTER KELAS
CREATE TABLE kelas (
    id TEXT PRIMARY KEY,
    nama TEXT NOT NULL UNIQUE,
    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. MASTER MATA PELAJARAN
CREATE TABLE mata_pelajaran (
    id TEXT PRIMARY KEY,
    nama_arab TEXT NOT NULL,
    nama_indo TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. MASTER JADWAL
-- day_index:
-- 0 = Sabtu
-- 1 = Ahad
-- 2 = Senin
-- 3 = Selasa
-- 4 = Rabu
-- 5 = Kamis
--
-- Jumat merupakan hari libur.
-- period: 1 sampai 4.

CREATE TABLE jadwal (
    id TEXT PRIMARY KEY,
    kelas_id TEXT NOT NULL,
    guru_id TEXT NOT NULL,
    mata_pelajaran_id TEXT NOT NULL,
    day_index INTEGER NOT NULL
        CHECK (day_index BETWEEN 0 AND 5),
    period INTEGER NOT NULL
        CHECK (period BETWEEN 1 AND 4),
    is_active INTEGER NOT NULL DEFAULT 1
        CHECK (is_active IN (0, 1)),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (kelas_id)
        REFERENCES kelas(id) ON DELETE RESTRICT,

    FOREIGN KEY (guru_id)
        REFERENCES guru(id) ON DELETE RESTRICT,

    FOREIGN KEY (mata_pelajaran_id)
        REFERENCES mata_pelajaran(id) ON DELETE RESTRICT
);

-- Satu kelas tidak boleh memiliki dua pelajaran
-- pada hari dan periode yang sama.
CREATE UNIQUE INDEX idx_jadwal_active_class_slot
ON jadwal(kelas_id, day_index, period)
WHERE is_active = 1;

-- Satu guru tidak boleh mengajar dua kelas
-- pada hari dan periode yang sama.
CREATE UNIQUE INDEX idx_jadwal_active_teacher_slot
ON jadwal(guru_id, day_index, period)
WHERE is_active = 1;

CREATE INDEX idx_jadwal_guru
ON jadwal(guru_id);

CREATE INDEX idx_jadwal_kelas
ON jadwal(kelas_id);

-- 5. PENGATURAN SISTEM
CREATE TABLE pengaturan (
    kunci TEXT PRIMARY KEY,
    nilai TEXT NOT NULL,
    keterangan TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 6. HISTORI PERUBAHAN JADWAL
-- Perubahan jadwal dicatat sebagai snapshot.
-- Jangan menghapus atau menimpa histori lama.

CREATE TABLE jadwal_histori (
    id TEXT PRIMARY KEY,
    jadwal_id TEXT NOT NULL,
    event_type TEXT NOT NULL
        CHECK (event_type IN (
            'CREATE',
            'UPDATE',
            'DEACTIVATE'
        )),
    before_json TEXT,
    after_json TEXT,
    changed_by TEXT,
    changed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (jadwal_id)
        REFERENCES jadwal(id) ON DELETE RESTRICT
);

CREATE INDEX idx_jadwal_histori_jadwal
ON jadwal_histori(jadwal_id);

CREATE INDEX idx_jadwal_histori_date
ON jadwal_histori(changed_at);
-- Migration number: 0001 	 2026-11-06T06:45:52.466Z
