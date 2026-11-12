import { useEffect, useState } from 'react'
import { Badge, Button, Card } from '../../components/ui'
import { ApiError, getAbsenHistory, type AbsenRecord } from '../../lib/api'

export interface RekapitulasiPageProps {
  onBack: () => void
}

const STATUS_FILTERS = ['', 'Izin', 'Sakit', 'Ghaib'] as const

function statusVariant(status: string): 'info' | 'warning' | 'danger' | 'neutral' {
  if (status === 'Sakit') return 'warning'
  if (status === 'Ghaib') return 'danger'
  if (status === 'Izin') return 'info'
  return 'neutral'
}

function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `Gagal memuat rekapitulasi (kode ${error.status}).`
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Terjadi kesalahan. Silakan coba lagi.'
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date)
}

export function RekapitulasiPage({ onBack }: RekapitulasiPageProps) {
  const [rows, setRows] = useState<AbsenRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    let cancelled = false
    getAbsenHistory({
      per_page: 100,
      status: status || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    })
      .then((res) => {
        if (cancelled) return
        setRows(res.data ?? [])
        setError('')
        setLoading(false)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(toMessage(e))
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [dateFrom, dateTo, status])

  return (
    <div className="dl-container dl-stack">
      <header className="dl-row">
        <Button onClick={onBack} variant="ghost">
          ← Kembali
        </Button>
        <div className="dl-grow">
          <h1 className="dl-section-title">Rekapitulasi Absensi</h1>
          <p className="dl-muted">Admin melihat seluruh data; guru melihat data miliknya.</p>
        </div>
      </header>

      <div className="dl-filters">
        <div className="field">
          <label className="field__label" htmlFor="rek-status">
            Status
          </label>
          <select
            className="field__control"
            id="rek-status"
            onChange={(e) => setStatus(e.target.value)}
            value={status}
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s || 'semua'} value={s}>
                {s || 'Semua'}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="rek-from">
            Dari tanggal
          </label>
          <input
            className="field__control"
            id="rek-from"
            onChange={(e) => setDateFrom(e.target.value)}
            type="date"
            value={dateFrom}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="rek-to">
            Sampai tanggal
          </label>
          <input
            className="field__control"
            id="rek-to"
            onChange={(e) => setDateTo(e.target.value)}
            type="date"
            value={dateTo}
          />
        </div>
      </div>

      {error && (
        <p className="dl-alert dl-alert--error" role="alert">
          {error}
        </p>
      )}

      <Card>
        {loading ? (
          <p className="dl-muted">Memuat rekapitulasi...</p>
        ) : rows.length === 0 ? (
          <div className="dl-empty">
            <span className="dl-empty__icon" aria-hidden="true">
              📭
            </span>
            <p>Belum ada data absensi.</p>
          </div>
        ) : (
          <div className="dl-table-wrapper">
            <table className="dl-table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Guru</th>
                  <th>Status</th>
                  <th>Mata Pelajaran</th>
                  <th>Rincian Jam</th>
                  <th>Jml</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{formatDate(r.tanggal)}</td>
                    <td dir="auto">{r.guru_nama_sumber}</td>
                    <td>
                      <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                    </td>
                    <td dir="auto">{r.mata_pelajaran || '—'}</td>
                    <td>{r.rincian_jam || '—'}</td>
                    <td>{r.jumlah_jam ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
