import { Badge } from '../../components/ui'

export interface LandingPageProps {
  onTeacherAccess: () => void
  onAdminLogin: () => void
}

export function LandingPage({ onAdminLogin, onTeacherAccess }: LandingPageProps) {
  return (
    <>
      <section className="dl-hero">
        <div className="dl-hero__pattern" aria-hidden="true" />
        <div className="dl-hero__inner">
          <Badge className="dl-hero__badge" variant="info">
            Pesantren Dalwa
          </Badge>
          <h1 className="dl-hero__title">Jadwal &amp; Absensi Guru</h1>
          <p className="dl-hero__lede">
            Sistem manajemen jadwal dan absensi guru. Akses mandiri untuk guru, serta dasbor
            dan rekapitulasi lengkap untuk administrator.
          </p>
        </div>
      </section>

      <div className="dl-container">
        <div className="dl-entries">
          <button type="button" className="dl-entry dl-entry--accent" onClick={onTeacherAccess}>
            <span className="dl-entry__icon" aria-hidden="true">
              🧑‍🏫
            </span>
            <span className="dl-entry__title">Akses Guru</span>
            <span className="dl-entry__desc">
              Masuk dengan nama untuk melihat jadwal dan mengajukan izin/absen.
            </span>
          </button>

          <button type="button" className="dl-entry" onClick={onAdminLogin}>
            <span className="dl-entry__icon" aria-hidden="true">
              🛡️
            </span>
            <span className="dl-entry__title">Masuk Admin</span>
            <span className="dl-entry__desc">
              Kelola data, impor Excel, dan rekapitulasi kehadiran.
            </span>
          </button>
        </div>
      </div>
    </>
  )
}
