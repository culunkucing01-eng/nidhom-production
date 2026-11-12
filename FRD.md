# FRD — Nidhom Teacher Management System

Versi 1.0 · Turunan dari PRD v1.0 · Diperbarui 2026-11-12
Sumber: `AGENT.md`, `README.md`, `apps/api/**`, `apps/web/**`

## 1. Arsitektur Sistem
- **Web**: React 19 + Vite + TypeScript + Tailwind (`apps/web`). Dev server mem-proxy `/api` & `/auth` ke `http://127.0.0.1:8787` (Wrangler).
- **API**: Hono di Cloudflare Workers (`apps/api`). Database via binding D1 `DB` — **SQLite**, bukan PostgreSQL.
- **Sesi**: cookie `nidhom_session` (`httpOnly`, `secure`, `sameSite=Lax`). Admin idle 8 jam / absolut 24 jam; Guru idle 4 jam / absolut 12 jam. Token disimpan sebagai hash SHA-256.
- **Peran**: `ADMIN`, `LEADERSHIP`, `TEACHER`.

## 2. Model Data (ringkas, dari migrasi 0001–0005)
- `guru(id, kode UNIQUE, nama, is_active, created_at, updated_at)`
- `kelas(id, nama UNIQUE, is_active, …)`
- `mata_pelajaran(id, nama_arab, nama_indo, is_active, …)`
- `jadwal(id, kelas_id→kelas, guru_id→guru, mata_pelajaran_id→mata_pelajaran, day_index 0–5, period 1–4, is_active, …)`
  - Unique partial: satu kelas & satu guru tak boleh di slot (hari,periode) sama saat aktif. Jumat = libur.
- `pengaturan(kunci PK, nilai, keterangan, updated_at)`
- `jadwal_histori(id, jadwal_id→jadwal, event_type CREATE/UPDATE/DEACTIVATE, before_json, after_json, changed_by, changed_at)`
- `users(id, username UNIQUE NOCASE, password_hash, role ADMIN/LEADERSHIP/TEACHER, is_active, must_change_password, failed_login_attempts, locked_until, last_login_at, created_by→users, …)`
- `teacher_auth(id, user_id UNIQUE→users, guru_id UNIQUE→guru, created_at)`
- `sessions(id, user_id→users, token_hash UNIQUE (≥64), expires_at, last_activity_at, revoked_at, created_at)`
- `audit_logs(id, actor_user_id→users, action, entity_type, entity_id, before_json, after_json, created_at)`
- `import_source_keys(entity_type guru/kelas/mapel, source_key, entity_id, PK(entity_type,source_key), …)`
- `import_runs(id, file_name, file_hash(64), sheet_name, entity_type, uploaded_by→users, status completed/partial/failed, total_rows, inserted_count, updated_count, duplicate_count, failed_count, mapping_json, created_at)`
- `import_run_errors(id, import_run_id→import_runs ON DELETE CASCADE, row_number≥2, column_key, error_code, message)`
- `perizinan(id, guru_id→guru, guru_kode_sumber, guru_nama_sumber, judul, senin..minggu≥0, total≥0, …)` — unique(guru_kode_sumber) WHERE NOT NULL
- `absen(id, guru_id→guru, guru_nama_sumber, tanggal, status Izin/Sakit/Ghaib, rincian_jam, jumlah_jam≥0, mata_pelajaran, keterangan, …)` — unique(tanggal, guru_nama_sumber, rincian_jam)
- `log_hapus(id, waktu_hapus, waktu_input, tanggal, tahun, bulan, minggu_ke, nama_guru, status, rincian_jam, jumlah_jam, mata_pelajaran, keterangan, created_at)` — unique(waktu_hapus, nama_guru)
- `izin_pengajuan(id, ref_code UNIQUE, guru_id→guru, jenis Sakit/Izin/Tidak Hadir, tanggal, keterangan, status PENDING/DISETUJUI/DITOLAK, admin_id→users ON DELETE SET NULL, decided_at, decision_notes, …)`

## 3. Requirements Fungsional

### A. Autentikasi & Sesi
- **FR-AUTH-01** Admin login `POST /auth/login` (username+password) → set cookie sesi. *AC: kredensial salah → 401; sukses → user + cookie.*
- **FR-AUTH-02** `GET /auth/me` user saat ini (diizinkan saat `mustChangePassword`). *AC: tanpa sesi → 401.*
- **FR-AUTH-03** `POST /auth/change-password` (PBKDF2-SHA256 600k). *AC: lemah/salah → 400.*
- **FR-AUTH-04** `POST /auth/logout` revoke sesi + clear cookie.
- **FR-AUTH-05** Guru login `POST /api/teacher/login` berbasis `guru_id` (tanpa password). *AC: nonaktif/tidak ada → 404.*
- **FR-AUTH-06** `GET /api/teacher/guru-list` daftar guru aktif untuk pemilih nama (publik, sebelum sesi).
- **FR-AUTH-07** Logout guru `POST /api/teacher/logout`.

### B. Master Data (tulis ADMIN; baca peran terautentikasi)
- **FR-GURU-01..03** CRUD `guru` (`/api/guru`): list berpaginasi+filter status/q, create, update, `PATCH /:id/status`. *AC: kode duplikat → 409; non-admin tulis → 403.*
- **FR-KELAS-01** CRUD `kelas` (`/api/kelas`), pola sama.
- **FR-MAPEL-01** CRUD `mata_pelajaran` (`/api/mapel`), pola sama.
- **FR-JADWAL-01** `GET /api/jadwal` list; **FR-JADWAL-02** `GET /api/jadwal/timetable` grid hari×periode.

### C. Impor Excel
- **FR-IMPORT-01** `POST /api/imports/inspect` analisis file (tanpa tulis).
- **FR-IMPORT-02** `POST /api/imports/validate` validasi + rencana tulis.
- **FR-IMPORT-03** `POST /api/imports/commit` terapkan (transaksional via batch); catat `import_runs`/`import_run_errors`/`import_source_keys`.
- **FR-IMPORT-04** `GET /api/imports` riwayat impor.

### D. Perizinan / Absen / Log Hapus (data sumber)
- **FR-PERIZINAN-01** `GET /api/perizinan` list rekap; **-02** `GET /api/perizinan/:id`.
- **FR-ABSEN-01** `GET /api/absen` list absen (manajemen) filter q/status/guru/rentang tanggal.
- **FR-ABSEN-02** `GET /api/absen/history` riwayat (manajemen: semua/terfilter; guru: milik sendiri).
- **FR-ABSEN-03** `GET /api/absen/me` riwayat absen guru pemanggil.
- **FR-ABSEN-04** `POST /api/absen` catat absen (guru: milik sendiri; manajemen: guru lain via `guru_id`). *AC: status tak sah → 400; duplikat → 409.*
- **FR-ABSEN-05** `GET /api/absen/:id` detail (guru hanya milik sendiri).
- **FR-LOGHAPUS-01** `GET /api/perizinan/loghapus` + `/:id` (tabel `log_hapus`).

### E. Pengajuan Izin (workflow persetujuan)
- **FR-IZIN-01** `POST /api/izin` guru mengajukan → status PENDING + `ref_code`.
- **FR-IZIN-02** `GET /api/izin/me` daftar pengajuan guru sendiri.
- **FR-IZIN-03** `GET /api/izin` admin: semua + filter (status/guru/q/rentang tanggal).
- **FR-IZIN-04** `GET /api/izin/:id` detail (guru hanya milik sendiri).
- **FR-IZIN-05** `PATCH /api/izin/:id/decide` admin setuju/tolak (hanya dari PENDING).

### F. Dashboard
- **FR-DASH-01** `GET /api/dashboard/stats` hitungan guru/kelas/mapel/jadwal/absen/perizinan + aktivitas sinkronisasi terakhir.

## 4. Kontrak API (ringkas)
Semua response sukses: `{ data, pagination:{page,perPage,total,totalPages} }` atau `{ data }` atau `{ ok:true }`.

| Method | Path | Auth | Peran | Deskripsi |
|---|---|---|---|---|
| POST | /auth/login | publik | — | Login admin |
| POST | /auth/logout | sesi | any | Logout admin |
| GET | /auth/me | sesi | any | User saat ini |
| POST | /auth/change-password | sesi | any | Ganti password |
| POST | /api/teacher/login | publik | — | Login guru (nama) |
| POST | /api/teacher/logout | sesi | any | Logout guru |
| GET | /api/teacher/guru-list | publik | — | Daftar guru (pemilih) |
| GET/POST | /api/guru | sesi | baca:any, tulis:ADMIN | CRUD guru |
| PUT/PATCH | /api/guru/:id(/status) | sesi | ADMIN | Update/status guru |
| GET/POST | /api/kelas | sesi | baca:any, tulis:ADMIN | CRUD kelas |
| GET/POST | /api/mapel | sesi | baca:any, tulis:ADMIN | CRUD mapel |
| GET | /api/jadwal, /api/jadwal/timetable | sesi | any | Jadwal |
| POST | /api/imports/inspect·validate·commit | sesi | ADMIN | Impor Excel |
| GET | /api/imports | sesi | ADMIN | Riwayat impor |
| GET | /api/perizinan, /:id | sesi | any | Rekap perizinan |
| GET | /api/perizinan/absen(/:id), /loghapus(/:id) | sesi | any | Absen & log hapus (sumber) |
| GET/POST | /api/absen | sesi | list:ADMIN/LEADERSHIP, POST:guru(own)/manajemen | Absen (FR-ABSEN) |
| GET | /api/absen/me, /api/absen/history, /api/absen/:id | sesi | any (own utk guru) | Riwayat/detail absen |
| POST | /api/izin | sesi | TEACHER | Ajukan izin |
| GET | /api/izin/me | sesi | TEACHER | Izin sendiri |
| GET | /api/izin | sesi | ADMIN | Semua izin |
| PATCH | /api/izin/:id/decide | sesi | ADMIN | Setuju/tolak |
| GET | /api/dashboard/stats | sesi | any | Statistik |

## 5. Aturan Validasi & Bisnis
- Status absen ∈ {Izin, Sakit, Ghaib}. Jenis izin ∈ {Sakit, Izin, Tidak Hadir}. Status izin ∈ {PENDING, DISETUJUI, DITOLAK}.
- Tanggal format `YYYY-MM-DD`. ID = UUID (`crypto.randomUUID()`).
- Paginasi `page`, `per_page` (`per_page ≤ 100`). Filter status `active/inactive/all`.
- Batas payload ≈ 4 KB; tolak control chars & oversize.
- Uniqueness: `guru.kode`, `kelas.nama`, `izin_pengajuan.ref_code`, `perizinan.guru_kode_sumber` (WHERE NOT NULL), `absen(tanggal,guru_nama_sumber,rincian_jam)`.

## 6. Penanganan Error
`400` validasi (`{error, fields?}`) · `401` auth · `403` peran · `404` tidak ditemukan · `409` konflik/duplikat · `413` payload besar · `500` kegagalan DB (pesan generik; detail hanya di log server).

## 7. Keamanan (NFR)
- **Semua** query DB berparameter (`.bind(...)`; batch untuk count+list). Dilarang interpolasi string input user ke SQL (audit pola `buildWhere`).
- Password PBKDF2-SHA256 600k iter + salt. Token sesi di-hash SHA-256 sebelum disimpan.
- Rate limit login (rencana): 30/IP/60s, 10/username/60s — namespace ID placeholder sampai diverifikasi operator.
- Audit log untuk aksi sensitif. Tidak ada secret di repo/dokumentasi.

## 8. Traceability ke PRD
E1 Integrasi Excel → FR-IMPORT-* · E2 Autentikasi ganda → FR-AUTH-* · E3 Dashboard Guru → FR-IZIN-01/02, FR-ABSEN-03/04 · E4 Dashboard Admin → FR-GURU/KELAS/MAPEL/JADWAL/IZIN-03/05/DASH · E5 Perizinan & Absen → FR-PERIZINAN-*, FR-ABSEN-*, FR-LOGHAPUS-* · E6 Audit & keamanan → §7.

## 9. Keterbatasan Diketahui
- Interpolasi string pada `buildWhere` (legacy) berisiko injeksi — wajib ditinjau/diparameterkan.
- Namespace rate-limit masih placeholder.
- Sebagian UI (detail jadwal guru, riwayat absen, panel admin, form impor) belum selesai.
- Beberapa script `scripts/*.mjs` dirujuk `package.json`/`wrangler.jsonc` belum ada di repo.
