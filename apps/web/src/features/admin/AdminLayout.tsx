import { useContext, type ReactNode } from 'react'
import { Button, ThemeToggle, type Theme } from '../../components/ui'
import { MuteButton } from '../../components/ui/MuteButton'
import type { AuthenticatedUser } from '../../lib/api'
import { AdminLayoutContext, type AdminScreen } from './AdminLayoutContext'
import './AdminLayout.css'

const screenTitles: Record<AdminScreen, string> = {
  overview: 'Dashboard',
  izin: 'Rekapitulasi',
  guru: 'Data Guru',
  kelas: 'Data Kelas',
  mapel: 'Mata Pelajaran',
  jadwal: 'Kelola Jadwal',
}

const navSections: AdminScreen[] = ['overview', 'izin']

/* Ikon minimalis untuk aksi cepat sidebar (mewarisi warna via currentColor) */
function IconPlus() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
  )
}
function IconBuilding() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 21V8l8-5 8 5v13" /><path d="M4 21h16" /><path d="M9 21v-6h6v6" /></svg>
  )
}
function IconBook() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z" /><path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z" /></svg>
  )
}
function IconUpload() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 20h16" /></svg>
  )
}
function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M8 2v4M16 2v4" /><path d="M3 10h18" /></svg>
  )
}

interface AdminLayoutProps {
  user: AuthenticatedUser
  screen: AdminScreen
  setScreen: (screen: AdminScreen) => void
  onLogout: () => void
  onToggleTheme: () => void
  theme: Theme
  onImportExcel: () => void
  logoutLoading?: boolean
  children: ReactNode
}

export function AdminLayout({
  user,
  screen,
  setScreen,
  onLogout,
  onToggleTheme,
  onImportExcel,
  theme,
  logoutLoading = false,
  children,
}: AdminLayoutProps) {
  return (
    <AdminLayoutContext.Provider value={{ screen, setScreen }}>
      <AdminLayoutShell
        user={user}
        screen={screen}
        logoutLoading={logoutLoading}
        onLogout={onLogout}
        onToggleTheme={onToggleTheme}
        onImportExcel={onImportExcel}
        theme={theme}
      >
        {children}
      </AdminLayoutShell>
    </AdminLayoutContext.Provider>
  )
}

interface AdminLayoutShellProps {
  user: AuthenticatedUser
  screen: AdminScreen
  logoutLoading: boolean
  onLogout: () => void
  onToggleTheme: () => void
  onImportExcel: () => void
  theme: Theme
  children: ReactNode
}

function AdminLayoutShell({
  user,
  screen,
  logoutLoading,
  onLogout,
  onToggleTheme,
  onImportExcel,
  theme,
  children,
}: AdminLayoutShellProps) {
  const { setScreen } = useContext(AdminLayoutContext) as { screen: AdminScreen; setScreen: (screen: AdminScreen) => void }

  const quickActions: { key: string; label: string; icon: ReactNode; screen?: AdminScreen }[] = [
    { key: 'guru', label: 'Tambah Guru', icon: <IconPlus />, screen: 'guru' },
    { key: 'kelas', label: 'Tambah Kelas', icon: <IconBuilding />, screen: 'kelas' },
    { key: 'mapel', label: 'Mata Pelajaran', icon: <IconBook />, screen: 'mapel' },
    { key: 'import', label: 'Import Excel', icon: <IconUpload /> },
    { key: 'jadwal', label: 'Kelola Jadwal', icon: <IconCalendar />, screen: 'jadwal' },
  ]

  return (
    <div className="admin-layout">
      <aside className="admin-sidebar" aria-label="Navigasi utama admin">
        <div className="admin-sidebar__brand">
          <span className="admin-sidebar__logo">N</span>
          <div>
            <p className="admin-sidebar__title">Pesantren Dalwa</p>
            <p className="admin-sidebar__subtitle">Jadwal & Absensi</p>
          </div>
        </div>
        <nav className="admin-sidebar__nav">
          {navSections.map((section) => (
            <button
              key={section}
              className={`admin-sidebar__link ${screen === section ? 'is-active' : ''}`}
              onClick={() => setScreen(section)}
              type="button"
            >
              {screenTitles[section]}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar__actions">
          <p className="admin-sidebar__actions-title">Aksi Cepat</p>
          {quickActions.map((action) => (
            <button
              key={action.key}
              className={`admin-sidebar__action ${action.screen && screen === action.screen ? 'is-active' : ''}`}
              onClick={() => (action.screen ? setScreen(action.screen) : onImportExcel())}
              type="button"
            >
              <span className="admin-sidebar__action-icon">{action.icon}</span>
              <span className="admin-sidebar__action-label">{action.label}</span>
            </button>
          ))}
        </div>
      </aside>
      <div className="admin-layout__main">
        <header className="admin-header">
          <div className="admin-header__brand">
            <p className="admin-header__eyebrow">Pesantren Dalwa</p>
            <h1 className="admin-header__title">{screenTitles[screen]}</h1>
          </div>
          <div className="admin-header__actions">
            <MuteButton />
            <div className="admin-header__user">{user.username}</div>
            <ThemeToggle onToggle={onToggleTheme} theme={theme} />
            <Button loading={logoutLoading} onClick={onLogout} variant="secondary">
              {logoutLoading ? 'Keluar...' : 'Keluar'}
            </Button>
          </div>
        </header>
        <main className="admin-content">{children}</main>
      </div>
    </div>
  )
}