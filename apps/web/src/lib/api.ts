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
