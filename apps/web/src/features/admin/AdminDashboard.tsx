import { useEffect, useState } from 'react'
import { Button, Card, Badge } from '../../components/ui'
import { getDashboardStats, type DashboardStats } from '../../lib/api'
import './AdminDashboard.css'

export interface AdminDashboardProps {
  onNavigateGuru?: () => void
  onNavigateKelas?: () => void
  onNavigateMapel?: () => void
  onNavigateJadwal?: () => void
  onImportExcel?: () => void
}

export function AdminDashboard({
  onNavigateGuru,
  onNavigateKelas,
  onNavigateMapel,
  onNavigateJadwal,
  onImportExcel,
}: AdminDashboardProps) {
  const [stats, setStats] = useState<DashboardStats['stats']>({})
  const [syncHistory, setSyncHistory] = useState<DashboardStats['recentSyncActivity']>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await getDashboardStats()
        if (!cancelled) {
          setStats(data.stats)
          setSyncHistory(data.recentSyncActivity || [])
        }
      } catch {
        if (!cancelled) setError('Gagal memuat statistik dashboard')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const statCards = [
    { key: 'totalTeachers', label: 'Total Guru', icon: '👨‍🏫', color: 'info' },
    { key: 'totalClasses', label: 'Total Kelas', icon: '🏫', color: 'success' },
    { key: 'totalSubjects', label: 'Mata Pelajaran', icon: '📚', color: 'warning' },
    { key: 'totalSchedules', label: 'Jadwal Aktif', icon: '📅', color: 'primary' },
    { key: 'totalAbsen', label: 'Catatan Absen', icon: '📋', color: 'neutral' },
    { key: 'totalPerizinan', label: 'Rekap Izin', icon: '📄', color: 'danger' },
  ]

  if (loading) {
    return (
      <div className="admin-dashboard">
        <div className="dashboard-loading">Memuat dashboard...</div>
      </div>
    )
  }

  return (
    <div className="admin-dashboard">
      {error && <p className="dashboard-error" role="alert">{error}</p>}
      <section className="dashboard-stats" aria-label="Statistik utama">
        {statCards.map((card) => (
          <Card key={card.key} className="stat-card">
            <div className={`stat-card__icon stat-card__icon--${card.color}`}>
              <span aria-hidden="true">{card.icon}</span>
            </div>
            <div className="stat-card__content">
              <p className="stat-card__label">{card.label}</p>
              <p className="stat-card__value">
                {stats[card.key] ?? 0}
              </p>
            </div>
          </Card>
        ))}
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

          <Card className="dashboard-card">
            <header className="dashboard-card__header">
              <h2>Aksi Cepat</h2>
            </header>
            <div className="dashboard-card__body quick-actions">
              <Button variant="primary" onClick={onNavigateGuru} disabled={!onNavigateGuru}>
                Tambah Guru
              </Button>
              <Button variant="primary" onClick={onNavigateKelas} disabled={!onNavigateKelas}>
                Tambah Kelas
              </Button>
              <Button variant="secondary" onClick={onNavigateMapel} disabled={!onNavigateMapel}>
                Kelola Mata Pelajaran
              </Button>
              <Button variant="secondary" onClick={onImportExcel} disabled={!onImportExcel}>
                Import Data Excel
              </Button>
              <Button variant="secondary" onClick={onNavigateJadwal} disabled={!onNavigateJadwal}>
                Kelola Jadwal
              </Button>
            </div>
          </Card>
        </div>
      </section>
    </div>
  )
}