-- NIDHOM Migration 0006: izin detail and realtime sync metadata.
-- Data-preserving SQLite table rebuild to expand the status CHECK and add
-- kelas/mapel/jam_terdampak/guru_pengganti columns.
-- NOTE: No explicit BEGIN/COMMIT — wrangler d1 migrations apply wraps the
-- entire file in a single transaction automatically.

CREATE TABLE izin_pengajuan_v6 (
    id TEXT PRIMARY KEY,
    ref_code TEXT NOT NULL UNIQUE CHECK (length(trim(ref_code)) > 0),
    guru_id TEXT NOT NULL REFERENCES guru(id) ON DELETE RESTRICT,
    jenis TEXT NOT NULL CHECK (trim(jenis) IN ('Sakit', 'Izin', 'Tidak Hadir')),
    tanggal TEXT NOT NULL CHECK (length(trim(tanggal)) > 0),
    keterangan TEXT,
    kelas_id TEXT REFERENCES kelas(id) ON DELETE SET NULL,
    mata_pelajaran_id TEXT REFERENCES mata_pelajaran(id) ON DELETE SET NULL,
    jam_terdampak TEXT,
    guru_pengganti_id TEXT REFERENCES guru(id) ON DELETE SET NULL,
    guru_pengganti_nama TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING'
        CHECK (trim(status) IN ('PENDING', 'DISETUJUI', 'DITOLAK', 'DISESUAIKAN')),
    admin_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    decided_at TEXT,
    decision_notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO izin_pengajuan_v6 (
    id, ref_code, guru_id, jenis, tanggal, keterangan, status, admin_id,
    decided_at, decision_notes, created_at, updated_at
)
SELECT id, ref_code, guru_id, jenis, tanggal, keterangan, status, admin_id,
       decided_at, decision_notes, created_at, updated_at
FROM izin_pengajuan;

DROP TABLE izin_pengajuan;
ALTER TABLE izin_pengajuan_v6 RENAME TO izin_pengajuan;

CREATE INDEX idx_izin_pengajuan_guru ON izin_pengajuan(guru_id);
CREATE INDEX idx_izin_pengajuan_status ON izin_pengajuan(status);
CREATE INDEX idx_izin_pengajuan_tanggal ON izin_pengajuan(tanggal);
CREATE INDEX idx_izin_pengajuan_ref_code ON izin_pengajuan(ref_code);
CREATE INDEX idx_izin_pengajuan_updated ON izin_pengajuan(updated_at);
