import { useEffect, useState } from 'react'
import { Badge, Button, Card } from '../../components/ui'
import { ApiError, adminListIzin, getAbsenHistory, type AbsenRecord, type IzinRecord } from '../../lib/api'

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

function izinVariant(status: string): 'success' | 'warning' | 'danger' | 'info' {
  if (status === 'DISETUJUI') return 'success'
  if (status === 'DITOLAK') return 'danger'
  if (status === 'DISESUAIKAN') return 'info'
  return 'warning'
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
  const [izinRows, setIzinRows] = useState<IzinRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    let cancelled = false
    Promise.all([
      getAbsenHistory({
        per_page: 100,
        status: status || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
      adminListIzin({ per_page: '20' }),
    ])
      .then(([absenRes, izinRes]) => {
        if (cancelled) return
        setRows(absenRes.data ?? [])
        setIzinRows(izinRes.data ?? [])
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

      {izinRows.length > 0 && (
        <Card>
          <h2 style={{ marginBottom: '12px', fontSize: '16px' }}>Pengajuan Izin Terbaru</h2>
          <div className="dl-table-wrapper">
            <table className="dl-table">
              <thead>
                <tr>
                  <th>Kode</th>
                  <th>Guru</th>
                  <th>Jenis</th>
                  <th>Tanggal</th>
                  <th>Status</th>
                  <th>Keterangan</th>
                </tr>
              </thead>
              <tbody>
                {izinRows.map((iz) => (
                  <tr key={iz.id}>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{iz.ref_code}</td>
                    <td dir="auto">{iz.guru_nama || '—'}</td>
                    <td>{iz.jenis}</td>
                    <td>{formatDate(iz.tanggal)}</td>
                    <td>
                      <Badge variant={izinVariant(iz.status)}>{iz.status}</Badge>
                    </td>
                    <td dir="auto">{iz.keterangan || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
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
