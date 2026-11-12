-- Import mappings retain stable source identifiers without storing workbook files.
CREATE TABLE import_source_keys (
    entity_type TEXT NOT NULL
        CHECK (entity_type IN ('guru', 'kelas', 'mapel')),
    source_key TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (entity_type, source_key)
);

CREATE INDEX idx_import_source_entity
ON import_source_keys(entity_type, entity_id);

CREATE TABLE import_runs (
    id TEXT PRIMARY KEY,
    file_name TEXT NOT NULL,
    file_hash TEXT NOT NULL CHECK (length(file_hash) = 64),
    sheet_name TEXT NOT NULL,
    entity_type TEXT NOT NULL
        CHECK (entity_type IN ('guru', 'kelas', 'mapel', 'jadwal', 'perizinan', 'absen', 'loghapus', 'pengaturan')),
    uploaded_by TEXT NOT NULL,
    status TEXT NOT NULL
        CHECK (status IN ('completed', 'partial', 'failed')),
    total_rows INTEGER NOT NULL CHECK (total_rows >= 0),
    inserted_count INTEGER NOT NULL CHECK (inserted_count >= 0),
    updated_count INTEGER NOT NULL CHECK (updated_count >= 0),
    duplicate_count INTEGER NOT NULL CHECK (duplicate_count >= 0),
    failed_count INTEGER NOT NULL CHECK (failed_count >= 0),
    mapping_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (uploaded_by)
        REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX idx_import_runs_created
ON import_runs(created_at DESC);

CREATE INDEX idx_import_runs_actor
ON import_runs(uploaded_by, created_at DESC);

CREATE TABLE import_run_errors (
    id TEXT PRIMARY KEY,
    import_run_id TEXT NOT NULL,
    row_number INTEGER NOT NULL CHECK (row_number >= 2),
    column_key TEXT,
    error_code TEXT NOT NULL,
    message TEXT NOT NULL,
    FOREIGN KEY (import_run_id)
        REFERENCES import_runs(id) ON DELETE CASCADE
);

CREATE INDEX idx_import_run_errors_run
ON import_run_errors(import_run_id, row_number);
