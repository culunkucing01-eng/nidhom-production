export type UserRole = 'ADMIN' | 'LEADERSHIP' | 'TEACHER'

export interface AuthenticatedUser {
  id: string
  username: string
  role: UserRole
  mustChangePassword: boolean
  teacher: {
    id: string
    code: string
    name: string
  } | null
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Authentication API returned ${status}`)
    this.name = 'ApiError'
    this.status = status
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAuthenticatedUser(value: unknown): value is AuthenticatedUser {
  if (!isRecord(value)) {
    return false
  }

  const validRole =
    value.role === 'ADMIN' || value.role === 'LEADERSHIP' || value.role === 'TEACHER'
  const teacher = value.teacher
  const validTeacher =
    teacher === null ||
    (isRecord(teacher) &&
      typeof teacher.id === 'string' &&
      typeof teacher.code === 'string' &&
      typeof teacher.name === 'string')

  return (
    typeof value.id === 'string' &&
    typeof value.username === 'string' &&
    validRole &&
    typeof value.mustChangePassword === 'boolean' &&
    validTeacher
  )
}

async function requestJson(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...init?.headers,
      },
    })
  } catch {
    throw new Error('Authentication API is unreachable')
  }

  if (!response.ok) {
    throw new ApiError(response.status)
  }

  try {
    return (await response.json()) as unknown
  } catch {
    throw new Error('Authentication API returned an invalid response')
  }
}

async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  return (await requestJson(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  })) as T
}

function readUserResponse(payload: unknown): AuthenticatedUser {
  if (!isRecord(payload) || !isAuthenticatedUser(payload.user)) {
    throw new Error('Authentication API returned an invalid user')
  }
  return payload.user
}

export async function login(
  username: string,
  password: string,
): Promise<AuthenticatedUser> {
  const payload = await requestJson('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  return readUserResponse(payload)
}

export async function getCurrentUser(): Promise<AuthenticatedUser> {
  return readUserResponse(await requestJson('/auth/me'))
}

export async function logout(): Promise<void> {
  const payload = await requestJson('/auth/logout', { method: 'POST' })
  if (!isRecord(payload) || payload.success !== true) {
    throw new Error('Authentication API returned an invalid logout response')
  }
}

export async function changePassword(
  currentPassword: string,
  newPassword: string,
): Promise<AuthenticatedUser> {
  const payload = await requestJson('/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ currentPassword, newPassword }),
  })
  return readUserResponse(payload)
}

export interface DashboardStats {
  stats: Record<string, number>
  recentSyncActivity: SyncActivity[]
}

export interface SyncActivity {
  id: string
  file_name: string
  sheet_name: string
  entity_type: string
  status: string
  total_rows: number
  inserted_count: number
  updated_count: number
  failed_count: number
  created_at: string
}

export interface JadwalItem {
  id: string
  period: number
  mapel_nama_arab?: string
  mapel_nama_indo?: string | null
  kelas_nama?: string
  [key: string]: unknown
}

export type IzinItem = IzinRecord
export type User = AuthenticatedUser

export async function getDashboardStats(): Promise<DashboardStats> {
  return apiJson<DashboardStats>('/api/dashboard/stats')
}

// ── Izin ─────────────────────────────────────────────────────────────────────────
export interface IzinRecord {
  id: string; ref_code: string; guru_id: string; jenis: string; tanggal: string
  keterangan: string | null; status: string; admin_id: string | null
  decided_at: string | null; decision_notes: string | null
  created_at: string; updated_at: string
  guru_kode: string | null; guru_nama: string | null; admin_username: string | null
}

export async function getMyIzin(params: { page?: number | string; per_page?: number | string; status?: string }): Promise<{ data: IzinRecord[]; pagination: Record<string, unknown> }> {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', String(params.page))
  if (params.per_page) qs.set('per_page', String(params.per_page))
  if (params.status) qs.set('status', params.status)
  return apiJson<{ data: IzinRecord[]; pagination: Record<string, unknown> }>(`/api/izin/me?${qs}`)
}
export async function getIzinDetail(id: string): Promise<{ data: IzinRecord }> {
  return apiJson<{ data: IzinRecord }>(`/api/izin/${encodeURIComponent(id)}`)
}
export async function submitIzin(jenis: string, tanggal: string, keterangan?: string): Promise<{ id: string; ref_code: string; status: string }> {
  const body: Record<string, unknown> = { jenis, tanggal }
  if (keterangan) body.keterangan = keterangan
  const payload = await apiJson<{ id: string; ref_code: string; status: string }>('/api/izin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!isRecord(payload)) throw new Error('Invalid response')
  return payload as { id: string; ref_code: string; status: string }
}
export async function decideIzin(id: string, decision: 'DISETUJUI' | 'DITOLAK', notes?: string): Promise<{ ok: boolean; status: string; decided_at: string }> {
  const payload = await apiJson<{ ok: boolean; status: string; decided_at: string }>(`/api/izin/${encodeURIComponent(id)}/decide`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, notes: notes ?? null }) })
  if (!isRecord(payload) || payload.ok !== true) throw new Error('Invalid response')
  return payload as { ok: boolean; status: string; decided_at: string }
}
export async function adminListIzin(params: Record<string, string>): Promise<{ data: IzinRecord[]; pagination: Record<string, unknown> }> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v)
  return apiJson<{ data: IzinRecord[]; pagination: Record<string, unknown> }>(`/api/izin?${qs}`)
}

// ── Guru / Kelas / Mapel ─────────────────────────────────────────────────────────
export async function getGuruListForAdmin(params: { page?: number; per_page?: number; q?: string }): Promise<{ data: unknown[]; pagination: Record<string, unknown> }> {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', String(params.page))
  if (params.per_page) qs.set('per_page', String(params.per_page))
  if (params.q) qs.set('q', params.q)
  return apiJson<{ data: unknown[]; pagination: Record<string, unknown> }>(`/api/guru?${qs}`)
}

// ---- Teacher-only login (name-based, no password) ----
export async function teacherLogin(guruId: string): Promise<AuthenticatedUser> {
  const payload = await requestJson("/api/teacher/login", {
    method: "POST",
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guru_id: guruId }),
  });
  return readUserResponse(payload)
}

export async function teacherLogout(): Promise<void> {
  await requestJson("/api/teacher/logout", { method: "POST" });
}

// Public list for the teacher login picker (no session required)
export async function getGuruList(): Promise<unknown[]> {
  const payload = await requestJson('/api/teacher/guru-list')
  if (!isRecord(payload) || !Array.isArray(payload.gurus)) return []
  return payload.gurus as unknown[]
}

export async function getKelasList(params: { page?: number; per_page?: number; q?: string }): Promise<{ data: unknown[]; pagination: Record<string, unknown> }> {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', String(params.page))
  if (params.per_page) qs.set('per_page', String(params.per_page))
  if (params.q) qs.set('q', params.q)
  return apiJson<{ data: unknown[]; pagination: Record<string, unknown> }>(`/api/kelas?${qs}`)
}
export async function getMapelList(params: { page?: number; per_page?: number; q?: string }): Promise<{ data: unknown[]; pagination: Record<string, unknown> }> {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', String(params.page))
  if (params.per_page) qs.set('per_page', String(params.per_page))
  if (params.q) qs.set('q', params.q)
  return apiJson<{ data: unknown[]; pagination: Record<string, unknown> }>(`/api/mapel?${qs}`)
}

// ── Jadwal ─────────────────────────────────────────────────────────────────────────
export async function getJadwalList(params: { page?: number; per_page?: number; filters?: Record<string, string> }): Promise<{ data: unknown[]; pagination: Record<string, unknown> }> {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', String(params.page))
  if (params.per_page) qs.set('per_page', String(params.per_page))
  if (params.filters) qs.set('filters', JSON.stringify(params.filters))
  return apiJson<{ data: JadwalItem[]; pagination: Record<string, unknown> }>(`/api/jadwal?${qs}`)
}
export async function getJadwalTimetable(): Promise<{ days: string[]; periods: number[]; grid: Record<string, Record<string, unknown>>; count: number }> {
  return apiJson<{ days: string[]; periods: number[]; grid: Record<string, Record<string, unknown>>; count: number }>('/api/jadwal/timetable')
}

// ── Absen ───────────────────────────────────────────────────────────────────────
export interface AbsenRecord {
  id: string
  guru_id: string | null
  guru_nama_sumber: string
  tanggal: string
  status: string
  rincian_jam: string | null
  jumlah_jam: number | null
  mata_pelajaran: string | null
  keterangan: string | null
  created_at: string
  updated_at: string
}

export async function getAbsenList(params: { page?: number; per_page?: number; q?: string; status?: string; guru_id?: string; date_from?: string; date_to?: string }): Promise<{ data: AbsenRecord[]; pagination: Record<string, unknown> }> {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', String(params.page))
  if (params.per_page) qs.set('per_page', String(params.per_page))
  if (params.q) qs.set('q', params.q)
  if (params.status) qs.set('status', params.status)
  if (params.guru_id) qs.set('guru_id', params.guru_id)
  if (params.date_from) qs.set('date_from', params.date_from)
  if (params.date_to) qs.set('date_to', params.date_to)
  return apiJson<{ data: AbsenRecord[]; pagination: Record<string, unknown> }>(`/api/absen?${qs}`)
}
export async function getMyAbsen(params: { page?: number; per_page?: number; status?: string } = {}): Promise<{ data: AbsenRecord[]; pagination: Record<string, unknown> }> {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', String(params.page))
  if (params.per_page) qs.set('per_page', String(params.per_page))
  if (params.status) qs.set('status', params.status)
  return apiJson<{ data: AbsenRecord[]; pagination: Record<string, unknown> }>(`/api/absen/me?${qs}`)
}
export async function getAbsenHistory(params: { page?: number; per_page?: number; status?: string; guru_id?: string; date_from?: string; date_to?: string } = {}): Promise<{ data: AbsenRecord[]; pagination: Record<string, unknown> }> {
  const qs = new URLSearchParams()
  if (params.page) qs.set('page', String(params.page))
  if (params.per_page) qs.set('per_page', String(params.per_page))
  if (params.status) qs.set('status', params.status)
  if (params.guru_id) qs.set('guru_id', params.guru_id)
  if (params.date_from) qs.set('date_from', params.date_from)
  if (params.date_to) qs.set('date_to', params.date_to)
  return apiJson<{ data: AbsenRecord[]; pagination: Record<string, unknown> }>(`/api/absen/history?${qs}`)
}
export async function submitAbsen(input: { status: string; tanggal: string; rincian_jam?: string; jumlah_jam?: number; mata_pelajaran?: string; keterangan?: string; guru_id?: string }): Promise<{ data: AbsenRecord }> {
  const body: Record<string, unknown> = { status: input.status, tanggal: input.tanggal }
  if (input.rincian_jam) body.rincian_jam = input.rincian_jam
  if (input.jumlah_jam !== undefined) body.jumlah_jam = input.jumlah_jam
  if (input.mata_pelajaran) body.mata_pelajaran = input.mata_pelajaran
  if (input.keterangan) body.keterangan = input.keterangan
  if (input.guru_id) body.guru_id = input.guru_id
  return apiJson<{ data: AbsenRecord }>('/api/absen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
}

