# PRD — Nidhom Teacher Management System

Versi 1.0 · Status: Draft (direkonstruksi dari `AGENT.md`, `README.md`, dan kode) · Diperbarui 2026-11-12
Pemilik: WusRouter bench

## 1. Ringkasan Produk
Sistem manajemen guru untuk sekolah (tradisi pesantren/Islami) yang mengintegrasikan workbook Excel sebagai sumber data utama ke database **Cloudflare D1 (SQLite)**. Mendukung login ganda (admin & guru), dashboard peran, pengajuan izin, serta pencatatan absen & perizinan. Desain UI: tema Islami modern (Emerald `#008B68`, Gold `#C7A45A`, tipografi Inter).

## 2. Tujuan & Objektif
- Migitalisasi data guru/kelas/mata pelajaran/jadwal dari Excel ke D1 yang terstruktur & dapat dicari.
- Portal guru mandiri (login berbasis nama) untuk melihat jadwal dan mengajukan izin/absen.
- Portal admin untuk mengelola data, mengimpor/menyinkronkan Excel, meninjau pengajuan, dan memantau statistik.
- Menjaga integritas data (FK, constraint, unique) dan jejak audit.

## 3. Persona & Peran
- **ADMIN** — akses penuh: CRUD master, impor Excel, review/putus izin & absen, statistik.
- **LEADERSHIP** — pemantau: membaca data & laporan, sebagian tindasan terbatas.
- **TEACHER (Guru)** — login hanya dengan nama (tanpa password): melihat jadwal & riwayat sendiri, mengajukan izin/absen.

## 4. Ruang Lingkup
**In-scope:** autentikasi ganda + manajemen sesi; master guru/kelas/mapel/jadwal; impor Excel (inspect→validate→commit) dengan audit; perizinan/absen/log hapus; pengajuan izin + persetujuan; dashboard statistik.

**Out-of-scope (saat ini):** payroll, notifikasi push/email, aplikasi mobile native, SSO eksternal, multi-tenant.

## 5. Epik / Fitur Utama
- **E1 — Integrasi Excel**: baca `Database Jadwal Pelajaran Guru.xlsx` & `sistem perizinan.xlsx`; sinkron semua record valid ke D1.
- **E2 — Autentikasi Ganda**: admin (username/password, PBKDF2) & guru (pilih nama). Sesi berbasis cookie aman + rate limit.
- **E3 — Dashboard Guru**: lihat jadwal pribadi (per hari/tanggal), ajukan izin/absen, lacak status & riwayat.
- **E4 — Dashboard Admin**: kelola data & impor/sinkron, kelola jadwal & guru, review izin/absen, akses riwayat & statistik.
- **E5 — Perizinan & Absen**: rekap izin per guru, catatan absen ber-tanggal, dan log penghapusan.
- **E6 — Audit & Keamanan**: audit log aksi sensitif, query berparameter, tanpa membocorkan secret.

## 6. Requirement Non-Fungsional
- **Keamanan**: cookie sesi `httpOnly`+`secure`+`sameSite=Lax`; password PBKDF2-SHA256 600k iterasi; token sesi di-hash; query DB berparameter (tanpa interpolasi input user); rate limit login.
- **Integritas**: foreign key + CHECK + unique (termasuk partial index); impor transaksional via `DB.batch`.
- **Kinerja**: paginasi (`page`/`per_page ≤ 100`); indeks pada kolom yang difilter.
- **Kompatibilitas**: D1 adalah **SQLite** (bukan PostgreSQL).
- **Keandalan**: pesan error generik ke user; detail hanya di log server.

## 7. Metrik Sukses
- 100% record valid dari Excel tersinkronisasi & dapat dicari.
- Alur login guru ≤ 3 langkah (pilih nama → masuk).
- 0 query dengan interpolasi input user (audit berkala).

## 8. Asumsi & Ketergantungan
- Cloudflare Workers + D1 + Wrangler; React 19 + Vite + TS + Tailwind.
- Sumber data Excel tersedia di `docs/source-data/` saat impor.
- Namespace rate-limit dibuat & diverifikasi operator sebelum deploy produksi.

## 9. Risiko & Mitigasi
- **Namespace rate-limit placeholder** → deploy terblokir; mitigasi: verifikasi ID di akun Cloudflare + set env attestasi sebelum `npm run deploy`.
- **Interpolasi string pada `buildWhere` (legacy)** → risiko injeksi; mitigasi: audit & konversi ke query berparameter.
- **UI belum lengkap** → rilis bertahap; backend API lebih dulu.

## 10. Kriteria Rilis (Definition of Done)
- Migrasi 0001–0005 berlaku bersih pada D1 lokal; CRUD, impor, dan izin teruji lokal; deploy guard lulus; tidak ada secret di repo/dokumentasi; tidak menulis ke produksi tanpa persetujuan.

## Glosarium
**D1** database SQLite Cloudflare · **Guru** teacher · **Kelas** class · **Mapel** mata pelajaran/subject · **Jadwal** schedule · **Izin** leave request · **Absen** attendance/absence record · **Perizinan** permission recap · **Wrangler** CLI Cloudflare.
