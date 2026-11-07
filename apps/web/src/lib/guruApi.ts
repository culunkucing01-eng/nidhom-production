export interface Guru {
  id: string
  kode: string
  nama: string
  is_active: number
  created_at: string
  updated_at: string
}

export type GuruStatusFilter = 'active' | 'inactive' | 'all'

export interface GuruListResponse {
  data: Guru[]
  pagination: {
    page: number
    perPage: number
    total: number
    totalPages: number
  }
}

export class GuruApiError extends Error {
  status: number
  fields?: Record<string, string>

  constructor(message: string, status: number, fields?: Record<string, string>) {
    super(message)
    this.name = 'GuruApiError'
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
    throw new GuruApiError('Layanan belum dapat dihubungi. Periksa koneksi, lalu coba lagi.', 0)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new GuruApiError('Respons layanan tidak dapat diproses.', response.status)
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
    throw new GuruApiError(
      typeof errorBody.error === 'string'
        ? errorBody.error
        : 'Permintaan belum dapat diproses.',
      response.status,
      fields,
    )
  }

  return body as T
}

export function listGuru(
  query: { page: number; perPage: number; q: string; status: GuruStatusFilter },
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
  return request<GuruListResponse>(`/api/guru?${search.toString()}`, { signal })
}

export function getGuru(id: string) {
  return request<{ data: Guru }>(`/api/guru/${encodeURIComponent(id)}`)
}

export function createGuru(values: { kode: string; nama: string }) {
  return request<{ data: Guru }>('/api/guru', {
    method: 'POST',
    body: JSON.stringify(values),
  })
}

export function updateGuru(id: string, values: { kode: string; nama: string }) {
  return request<{ data: Guru }>(`/api/guru/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(values),
  })
}

export function updateGuruStatus(id: string, isActive: boolean) {
  return request<{ data: Guru }>(`/api/guru/${encodeURIComponent(id)}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ isActive }),
  })
}
