import { useEffect, useState } from 'react'
import { Button, Card, Badge } from '../../components/ui'
import { getJadwalTimetable, getMyIzin, type AuthenticatedUser, type JadwalItem, type IzinItem } from '../../lib/api'
import './TeacherDashboard.css'

export interface TeacherDashboardProps {
  user: AuthenticatedUser
  onNavigateIzinSubmit?: () => void
  onNavigateIzinHistory?: () => void
}

export function TeacherDashboard({
  user,
  onNavigateIzinSubmit,
  onNavigateIzinHistory,
}: TeacherDashboardProps) {
  const [greeting] = useState<string>(() => {
    const h = new Date().getHours()
    return h < 10 ? 'Selamat pagi' : h < 14 ? 'Selamat siang' : h < 18 ? 'Selamat sore' : 'Selamat malam'
  })
  const [todaySchedule, setTodaySchedule] = useState<JadwalItem[]>([])
  const [latestIzin, setLatestIzin] = useState<IzinItem | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [timetable, izin] = await Promise.all([
          getJadwalTimetable(),
          getMyIzin({ per_page: 5 }),
        ])
        if (!cancelled) {
          const todayIdx = new Date().getDay()
          const dayMap = ['ahad', 'senin', 'selasa', 'rabu', 'kamis', 'sabtu']
          const todayKey = dayMap[todayIdx === 0 ? 0 : todayIdx]
          const todayRows: JadwalItem[] = []
          const grid = (timetable.grid ?? {}) as Record<string, Record<string, JadwalItem>>
          for (const period of [1, 2, 3, 4]) {
            const item = grid[todayKey]?.[period]
            if (item) todayRows.push(item)
          }
          setTodaySchedule(todayRows)
          setLatestIzin(izin.data?.[0] || null)
        }
      } catch {
        /* silent */
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="teacher-dashboard">
      <section className="teacher-welcome" aria-label="Selamat datang">
        <div className="teacher-welcome__greeting">
          <h1>{greeting}, {user.teacher?.name || user.username}</h1>
          <p className="teacher-welcome__date">
            {new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="teacher-welcome__actions">
          <Button
            variant="primary"
            onClick={onNavigateIzinSubmit}
            disabled={!onNavigateIzinSubmit}
          >
            Ajukan Izin
          </Button>
          <Button
            variant="secondary"
            onClick={onNavigateIzinHistory}
            disabled={!onNavigateIzinHistory}
          >
            Lihat Riwayat
          </Button>
        </div>
      </section>

      <section className="teacher-grid" aria-label="Dashboard guru">
        <div className="teacher-grid__left">
          <Card className="teacher-card">
            <header className="teacher-card__header">
              <h2>Jadwal Hari Ini</h2>
              <span className="teacher-card__badge">{todaySchedule.length} pelajaran</span>
            </header>
            <div className="teacher-card__body">
              {loading ? (
                <p className="teacher-card__placeholder">Memuat jadwal...</p>
              ) : todaySchedule.length === 0 ? (
                <p className="teacher-card__placeholder">Tidak ada jadwal pelajaran hari ini.</p>
              ) : (
                <ul className="schedule-list">
                  {todaySchedule.map((item, idx) => (
                    <li key={idx} className="schedule-item">
                      <span className="schedule-item__period">Periode {item.period}</span>
                      <div className="schedule-item__detail">
                        <span className="schedule-item__subject">{item.mapel_nama_arab || item.mapel_nama_indo || 'Mata pelajaran'}</span>
                        <span className="schedule-item__class">{item.kelas_nama || 'Kelas'}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>

          <Card className="teacher-card">
            <header className="teacher-card__header">
              <h2>Riwayat Izin Terbaru</h2>
            </header>
            <div className="teacher-card__body">
              {latestIzin ? (
                <div className="izin-summary">
                  <div className="izin-summary__meta">
                    <span className="izin-summary__ref">{latestIzin.ref_code}</span>
                    <Badge variant={
                      latestIzin.status === 'DISETUJUI' ? 'success' :
                      latestIzin.status === 'DITOLAK' ? 'danger' : 'warning'
                    }>
                      {latestIzin.status}
                    </Badge>
                  </div>
                  <p className="izin-summary__detail">
                    {latestIzin.jenis} &middot; {latestIzin.tanggal}
                  </p>
                </div>
              ) : (
                <p className="teacher-card__placeholder">Belum ada riwayat izin.</p>
              )}
            </div>
          </Card>
        </div>

        <div className="teacher-grid__right">
          <Card className="teacher-card teacher-card--wide">
            <header className="teacher-card__header">
              <h2>Jadwal Mingguan</h2>
            </header>
            <div className="teacher-card__body">
              <p className="teacher-card__placeholder">
                Pengaturan jadwal mingguan akan ditampilkan di sini.
              </p>
            </div>
          </Card>
        </div>
      </section>
    </div>
  )
}