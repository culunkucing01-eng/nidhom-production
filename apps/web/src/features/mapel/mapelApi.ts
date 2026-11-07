export interface Mapel {
  id: string
  nama_arab: string
  nama_indo: string | null
  is_active: number
  jadwal_aktif: number
  created_at: string
  updated_at: string
}

export type MapelStatusFilter = 'active' | 'inactive' | 'all'

export interface MapelListResponse {
  data: Mapel[]
  pagination: {
    page: number
    perPage: number
    total: number
    totalPages: number
  }
}

export class MapelApiError extends Error {
  status: number
  fields?: Record<string, string>

  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message)
    this.name = 'MapelApiError'
    this.status = status
    this.fields = fields
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch {
    throw new MapelApiError('Layanan belum dapat dihubungi. Periksa koneksi, lalu coba lagi.', 0)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new MapelApiError('Respons layanan tidak dapat diproses.', response.status)
  }

  if (!response.ok) {
    const errorBody =
      typeof body === 'object' && body !== null
        ? (body as { error?: unknown; fields?: unknown })
        : {}
    const fields =
      typeof errorBody.fields === 'object' && errorBody.fields !== null
        ? Object.fromEntries(
            Object.entries(errorBody.fields).filter(
              ([, value]) => typeof value === 'string',
            ),
          ) as Record<string, string>
        : undefined
    throw new MapelApiError(
      typeof errorBody.error === 'string'
        ? errorBody.error
        : 'Permintaan belum dapat diproses.',
      response.status,
      fields,
    )
  }

  return body as T
}

export function listMapel(
  query: { page: number; perPage: number; q: string; status: MapelStatusFilter },
  signal?: AbortSignal,
) {
  const search = new URLSearchParams({
    page: String(query.page),
    per_page: String(query.perPage),
    status: query.status,
  })
  if (query.q) {
    search.set('q', query.q)
  }
  return request<MapelListResponse>(`/api/mapel?${search.toString()}`, { signal })
}

export function getMapel(id: string, signal?: AbortSignal) {
  return request<{ data: Mapel }>(`/api/mapel/${encodeURIComponent(id)}`, { signal })
}

export function createMapel(values: { nama_arab: string; nama_indo: string | null }) {
  return request<{ data: Mapel }>('/api/mapel', {
    method: 'POST',
    body: JSON.stringify(values),
  })
}

export function updateMapel(
  id: string,
  values: { nama_arab: string; nama_indo: string | null },
) {
  return request<{ data: Mapel }>(`/api/mapel/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(values),
  })
}

export function updateMapelStatus(id: string, isActive: boolean) {
  return request<{ data: Mapel }>(`/api/mapel/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  })
}
