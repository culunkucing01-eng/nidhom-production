import { useEffect, useMemo, useState } from 'react'
import { Button, Input } from '../../components/ui'
import { ApiError, getGuruList, teacherLogin, type AuthenticatedUser } from '../../lib/api'

interface GuruOption {
  id: string
  kode: string
  nama: string
}

export interface TeacherAccessProps {
  onBack: () => void
  onAuthenticated: (user: AuthenticatedUser) => void
}

function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `Gagal memproses (kode ${error.status}). Silakan coba lagi.`
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Terjadi kesalahan. Silakan coba lagi.'
}

export function TeacherAccess({ onAuthenticated, onBack }: TeacherAccessProps) {
  const [gurus, setGurus] = useState<GuruOption[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    getGuruList()
      .then((list) => {
        if (!cancelled) setGurus(list as GuruOption[])
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoadError(toMessage(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return gurus
    return gurus.filter(
      (g) => g.nama.toLowerCase().includes(q) || g.kode.toLowerCase().includes(q),
    )
  }, [gurus, query])

  async function handleLogin() {
    if (!selected) {
      setError('Pilih nama guru terlebih dahulu.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const user = await teacherLogin(selected)
      onAuthenticated(user)
    } catch (e) {
      setError(toMessage(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="dl-container dl-stack">
      <header className="dl-row">
        <Button onClick={onBack} variant="ghost">
          ← Kembali
        </Button>
        <div className="dl-grow">
          <h1 className="dl-section-title">Akses Guru</h1>
          <p className="dl-muted">Pilih nama Anda untuk masuk (tanpa kata sandi).</p>
        </div>
      </header>

      {loadError && (
        <p className="dl-alert dl-alert--error" role="alert">
          {loadError}
        </p>
      )}

      <Input
        autoComplete="off"
        id="guru-search"
        label="Cari nama / kode guru"
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Ketik nama guru..."
        value={query}
      />

      {loading ? (
        <p className="dl-muted">Memuat daftar guru...</p>
      ) : filtered.length === 0 ? (
        <div className="dl-empty">
          <span className="dl-empty__icon" aria-hidden="true">
            🔍
          </span>
          <p>Guru tidak ditemukan.</p>
        </div>
      ) : (
        <div aria-label="Daftar guru" className="dl-picker" role="radiogroup">
          {filtered.map((g) => (
            <button
              aria-checked={selected === g.id}
              className={`dl-picker__item ${selected === g.id ? 'is-active' : ''}`}
              key={g.id}
              onClick={() => setSelected(g.id)}
              role="radio"
              type="button"
            >
              <span className="dl-picker__name" dir="auto">
                {g.nama}
              </span>
              <span className="dl-picker__code" dir="auto">
                {g.kode}
              </span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="dl-alert dl-alert--error" role="alert">
          {error}
        </p>
      )}

      <Button
        className="button--block button--lg"
        disabled={loading || !selected}
        loading={submitting}
        onClick={handleLogin}
      >
        {submitting ? 'Memproses...' : 'Masuk'}
      </Button>
    </div>
  )
}
