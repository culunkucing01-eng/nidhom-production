# Nidhom Teacher Management System

## Overview
Production-grade school management system. Integrates Excel workbooks as primary data source, supports dual login (admin + teacher name-only), and provides dashboards for both roles. Built on React 19, TypeScript, Hono, and Cloudflare Workers D1.

## Features
- **Excel Integration**: Reads `Database Jadwal Pelajaran Guru.xlsx` and `sistem perizinan.xlsx` as primary data source. All valid records synchronized into D1 database and searchable throughout the application.
- **Dual Login System**:
  - Admin: secure username/password authentication with full system access.
  - Teacher/User: simple name-based entry without password, strictly limited permissions.
- **Teacher Dashboard**:
  - View personal teaching schedules by date or day.
  - Submit absence requests (Sick, Permission, or Not Attending).
  - Track request status and history.
- **Admin Dashboard**:
  - Manage all system data.
  - Import and synchronize Excel sources.
  - Manage schedules and teachers.
  - Review, approve, or reject absence requests.
  - Access synchronization history and system settings.
## UI/UX
Modern Islamic design system with Emerald `#008B68` primary, Gold `#C7A45A` accent, and refined typography (Inter). Features split-screen login portal, gradient welcome banner, responsive dashboards, hover/active states, loading indicators, and empty/error states. Every button has a working handler or is visibly disabled.

## Technology Stack
- **Frontend**: React 19, Vite, Tailwind CSS, TypeScript
- **Backend**: Hono (Node.js), Cloudflare Workers (wrangler)
- **Database**: D1 (SQLite-compatible) via `d1_databases` binding
- **Libraries**: xlsx, p-limit, eslint, typescript
- **Tools**: Composio (auth/migration utilities)

## Installation & Setup
1. `cd E:\nidhom-production\apps\web`
2. `npm install`
3. `npm run dev` → starts local Worker via `wrangler.local.jsonc`, separate local D1 identity.

## Local Development Commands
```bash
cd E:\nidhom-production\apps\web
npm install
npm run dev
```
Run tests:
```bash
npm run test:local-auth
npm run test:local-admin-flow
npm run test-deployment-guards
```
Generate types:
```bash
npm run cf-typegen
```

## Database Setup & Migration Instructions
Migrations 0001–0005 define core tables:
- `guru(id PK, kode UNIQUE, nama, is_active)`
- `kelas(id PK, nama UNIQUE, is_active)`
- `mata_pelajaran(id PK, nama_arab, nama_indo, ...)`
- `jadwal(id, kelas_id, guru_id, mata_pelajaran_id, day_index, period, is_active)`
- `perizinan(id, guru_id, judul, senin..minggu, total, ...)`
- `izin_pengajuan(id, ref_code, guru_id, jenis, tanggal, status, admin_id, ...)`
- `log_hapus(...)`
- `audit_logs(...)`, `sessions(...)`, `users(...)`, `teacher_auth(...)`
- `import_runs(...)`, `import_run_errors(...)`, `import_source_keys(...)`, `pengaturan(...)`
Indexes and unique constraints included. See `apps/api/migrations/*.sql`.

## API Overview
- Base URL: `https://sistemgurumanajemen.vercel.app` (FRONTEND_ORIGINS).
- Routes: `/api/<entity>`, `/auth`, `/api/dashboard`.
- Excel: POST `/inspect`, `/validate`, `/commit`; GET `/` history.
- Pagination: `page`, `per_page`.
- Filter status: `active/inactive/all`.
- Import plan fields: entityType, rows, issues, summary, entityWrites, sourceKeyWrites, mapping.
- Response: `{ data, pagination }` or error objects.

## Deployment Instructions & Prerequisites
1. In the intended Cloudflare account, create or select two distinct Rate Limiting namespaces and verify their IDs there. Do not use example IDs, local values, or IDs copied from another account.
2. Replace the two `namespace_id` placeholder strings in `wrangler.jsonc` with those verified positive integer IDs. Keep the limiter names and thresholds unchanged: 30/IP/60 seconds and 10/username/60 seconds.
3. Explicitly confirm that verification in the deployment environment by setting `NIDHOM_RATE_LIMIT_IDS_VERIFIED=I_VERIFIED_THESE_IN_CLOUDFLARE`.
4. Run `npm run deploy`. The script validates the IDs, uniqueness, binding names, thresholds, D1 target, and production entrypoint before invoking Wrangler.

## Known Issues & Limitations
- **String interpolation in `buildWhere`** may allow SQL injection; review before prod.
- **Rate-limit namespace IDs** are placeholders; must be replaced with verified IDs before deploy.
- **Teacher schedule detail view** not yet implemented.
- **Absence history UI** not yet implemented.
- **Admin panel pages** not yet fully built.
- **Import form UI** not yet implemented.
- **Not yet deployed**.

## Latest Significant Changes
- UI/UX polish: Modern Islamic design system applied (Emerald/Gold palette, Inter typography)
- Fixed quick action buttons in AdminDashboard (navigation handlers added)
- Fixed action buttons in TeacherDashboard (navigation handlers added)
- Enhanced Button component loading state with animated dots
- AdminLayout accepts children prop for flexible content rendering
- All async buttons have loading states
- Empty/error states improved across dashboards
- Design tokens updated in global.css

---
WusRouter at the door. Ship it.
README content placeholder
