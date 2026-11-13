// Klien API impor Excel (multipart). Endpoint: /api/imports/{inspect,validate,commit}

export interface ImportIssue {
  row: number
  column: string | null
  code: string
  message: string
}

export interface ImportSummary {
  totalRows: number
  inserted: number
  updated: number
  duplicates: number
  failed: number
}

export interface ImportSheetPreview {
  name: string
  hidden: boolean
  rowCount: number
  headers: string[]
  suggestedEntityType: string
  suggestedMapping: Record<string, string>
  overLimit: boolean
}

export interface InspectResponse {
  file: { name: string; size: number; sheetCount: number }
  sheets: ImportSheetPreview[]
}

export interface PlanResponse {
  summary: ImportSummary
  issues: ImportIssue[]
}

export interface CommitAllResponse {
  sheets: Array<{ sheet: string; entityType: string; summary: ImportSummary }>
}

export async function commitAllImport(file: File): Promise<CommitAllResponse> {
  const form = new FormData()
  form.append('file', file)
  return (await postForm('/api/imports/commit-all', form)) as CommitAllResponse
}

function errorFromBody(body: unknown, status: number): Error {
  if (body && typeof body === 'object' && 'error' in body) {
    const message = (body as { error?: unknown }).error
    if (typeof message === 'string') return new Error(message)
  }
  return new Error(`Permintaan gagal (${status}).`)
}

async function postForm(path: string, form: FormData): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(path, { method: 'POST', credentials: 'include', body: form })
  } catch {
    throw new Error('Layanan tidak dapat dihubungi. Periksa koneksi lalu coba lagi.')
  }
  let body: unknown = {}
  try {
    body = await response.json()
  } catch {
    // respons non-JSON diabaikan
  }
  if (!response.ok) {
    throw errorFromBody(body, response.status)
  }
  return body
}

export async function inspectImport(file: File): Promise<InspectResponse> {
  const form = new FormData()
  form.append('file', file)
  return (await postForm('/api/imports/inspect', form)) as InspectResponse
}

export async function validateImport(
  file: File,
  sheetName: string,
  entityType: string,
  mapping: Record<string, string>,
): Promise<PlanResponse> {
  const form = new FormData()
  form.append('file', file)
  form.append('sheetName', sheetName)
  form.append('entityType', entityType)
  form.append('mapping', JSON.stringify(mapping))
  return (await postForm('/api/imports/validate', form)) as PlanResponse
}

export async function commitImport(
  file: File,
  sheetName: string,
  entityType: string,
  mapping: Record<string, string>,
): Promise<PlanResponse & { id: string }> {
  const form = new FormData()
  form.append('file', file)
  form.append('sheetName', sheetName)
  form.append('entityType', entityType)
  form.append('mapping', JSON.stringify(mapping))
  return (await postForm('/api/imports/commit', form)) as PlanResponse & { id: string }
}
