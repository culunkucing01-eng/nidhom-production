import { useEffect, useState } from 'react'
import { Button, Card, Badge } from '../../components/ui'
import { getDashboardStats, type DashboardStats } from '../../lib/api'
import './AdminDashboard.css'

/* Ikon minimalis (stroke; mewarisi warna lewat currentColor) */
function IconUsers() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

function IconBuilding() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 21V8l8-5 8 5v13" />
      <path d="M4 21h16" />
      <path d="M9 21v-6a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6" />
    </svg>
  )
}

function IconBook() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z" />
      <path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z" />
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M8 2v4M16 2v4" />
      <path d="M3 10h18" />
    </svg>
  )
}

function IconClipboard() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="m9 13 2 2 4-4" />
    </svg>
  )
}

function IconFileText() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  )
}

function SectionSkeleton() {
  return (
    <Card className="dashboard-card">
      <div className="dashboard-card__header">
        <span className="skeleton-line skeleton-line--title" />
      </div>
      <div className="dashboard-card__body dashboard-card__body--skeleton">
        <span className="skeleton-line" />
        <span className="skeleton-line" />
        <span className="skeleton-line skeleton-line--short" />
      </div>
    </Card>
  )
}

export function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats['stats']>({})
  const [syncHistory, setSyncHistory] = useState<DashboardStats['recentSyncActivity']>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    getDashboardStats()
      .then((data) => {
        if (cancelled) return
        setStats(data.stats)
        setSyncHistory(data.recentSyncActivity || [])
        setFailed(false)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const statCards = [
    { key: 'totalTeachers', label: 'Total Guru', Icon: IconUsers },
    { key: 'totalClasses', label: 'Total Kelas', Icon: IconBuilding },
    { key: 'totalSubjects', label: 'Mata Pelajaran', Icon: IconBook },
    { key: 'totalSchedules', label: 'Jadwal Aktif', Icon: IconCalendar },
    { key: 'totalAbsen', label: 'Catatan Absen', Icon: IconClipboard },
    { key: 'totalPerizinan', label: 'Rekap Izin', Icon: IconFileText },
  ]

  if (loading) {
    return (
      <div className="admin-dashboard">
        <section className="dashboard-stats" aria-label="Memuat statistik" aria-busy="true">
          {statCards.map((card) => (
            <Card key={card.key} className="stat-card stat-card--skeleton">
              <span className="stat-card__icon skeleton" />
              <span className="skeleton-line skeleton-line--label" />
              <span className="skeleton-line skeleton-line--value" />
            </Card>
          ))}
        </section>
        <section className="dashboard-sections" aria-hidden="true">
          <div className="dashboard-column">
            <SectionSkeleton />
            <SectionSkeleton />
          </div>
          <div className="dashboard-column">
            <SectionSkeleton />
            <SectionSkeleton />
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="admin-dashboard">
      {failed && (
        <div className="dashboard-notice" role="status">
          <span>Statistik belum dapat dimuat.</span>
          <Button variant="ghost" onClick={() => setReloadKey((k) => k + 1)}>
            Muat ulang
          </Button>
        </div>
      )}

      <section className="dashboard-stats" aria-label="Statistik utama">
        {statCards.map((card) => {
          const Icon = card.Icon
          return (
            <Card key={card.key} className="stat-card">
              <span className="stat-card__icon">
                <Icon />
              </span>
              <div className="stat-card__content">
                <p className="stat-card__label">{card.label}</p>
                <p className={`stat-card__value${failed ? ' stat-card__value--muted' : ''}`}>
                  {failed ? '\u2014' : (stats[card.key] ?? 0)}
                </p>
              </div>
            </Card>
          )
        })}
      </section>

      <section className="dashboard-sections">
        <div className="dashboard-column">
          <Card className="dashboard-card">
            <header className="dashboard-card__header">
              <h2>Pengajuan Izin Menunggu</h2>
            </header>
            <div className="dashboard-card__body">
              <p className="dashboard-placeholder">Data pengajuan izin akan ditampilkan di sini.</p>
            </div>
          </Card>

          <Card className="dashboard-card">
            <header className="dashboard-card__header">
              <h2>Aktivitas Sinkronisasi Terbaru</h2>
            </header>
            <div className="dashboard-card__body">
              {syncHistory.length === 0 ? (
                <p className="dashboard-placeholder">Belum ada aktivitas sinkronisasi.</p>
              ) : (
                <ul className="sync-list">
                  {syncHistory.slice(0, 5).map((run) => (
                    <li key={run.id} className="sync-item">
                      <div className="sync-item__meta">
                        <span className="sync-item__file">{run.file_name}</span>
                        <span className="sync-item__entity">{run.entity_type}</span>
                      </div>
                      <div className="sync-item__summary">
                        <Badge variant={run.status === 'completed' ? 'success' : run.status === 'partial' ? 'warning' : 'danger'}>
                          {run.status}
                        </Badge>
                        <span>{run.inserted_count} baru, {run.updated_count} diperbarui, {run.failed_count} gagal</span>
                      </div>
                      <time className="sync-item__time" dateTime={run.created_at}>
                        {new Date(run.created_at).toLocaleString('id-ID')}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>

        <div className="dashboard-column">
          <Card className="dashboard-card">
            <header className="dashboard-card__header">
              <h2>Jadwal Hari Ini</h2>
            </header>
            <div className="dashboard-card__body">
              <p className="dashboard-placeholder">Ringkasan jadwal pelajaran hari ini akan ditampilkan di sini.</p>
            </div>
          </Card>
        </div>
      </section>
    </div>
  )
}
