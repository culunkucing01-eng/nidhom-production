-- =========================================================
-- NIDHOM
-- Migration 0005: Teacher Leave Request (Izin Pengajuan)
-- Supports both Admin portal and Teacher portal
-- =========================================================

CREATE TABLE izin_pengajuan (
    id TEXT PRIMARY KEY,
    ref_code TEXT NOT NULL UNIQUE
        CHECK (length(trim(ref_code)) > 0),
    guru_id TEXT NOT NULL
        REFERENCES guru(id) ON DELETE RESTRICT,
    jenis TEXT NOT NULL
        CHECK (trim(jenis) IN ('Sakit', 'Izin', 'Tidak Hadir')),
    tanggal TEXT NOT NULL
        CHECK (length(trim(tanggal)) > 0),
    keterangan TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (trim(status) IN ('PENDING', 'DISETUJUI', 'DITOLAK')),
    admin_id TEXT
        REFERENCES users(id) ON DELETE SET NULL,
    decided_at TEXT,
    decision_notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_izin_pengajuan_guru     ON izin_pengajuan(guru_id);
CREATE INDEX idx_izin_pengajuan_status   ON izin_pengajuan(status);
CREATE INDEX idx_izin_pengajuan_tanggal  ON izin_pengajuan(tanggal);
CREATE INDEX idx_izin_pengajuan_ref_code ON izin_pengajuan(ref_code);

-- Migration number: 0005  2026-11-07T00:00:00.000Z
