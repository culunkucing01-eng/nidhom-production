import { useContext, type ReactNode } from 'react'
import { Button, ThemeToggle, type Theme } from '../../components/ui'
import type { AuthenticatedUser } from '../../lib/api'
import { AdminLayoutContext, type AdminScreen } from './AdminLayoutContext'
import './AdminLayout.css'

const screenTitles: Record<AdminScreen, string> = {
  overview: 'Dashboard',
  izin: 'Rekapitulasi',
}

interface AdminLayoutProps {
  user: AuthenticatedUser
  screen: AdminScreen
  setScreen: (screen: AdminScreen) => void
  onLogout: () => void
  onToggleTheme: () => void
  theme: Theme
  logoutLoading?: boolean
  children: ReactNode
}

export function AdminLayout({
  user,
  screen,
  setScreen,
  onLogout,
  onToggleTheme,
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
  theme: Theme
  children: ReactNode
}

function AdminLayoutShell({
  user,
  screen,
  logoutLoading,
  onLogout,
  onToggleTheme,
  theme,
  children,
}: AdminLayoutShellProps) {
  const { setScreen } = useContext(AdminLayoutContext) as { screen: AdminScreen; setScreen: (screen: AdminScreen) => void }

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
          {(Object.keys(screenTitles) as AdminScreen[]).map((section) => (
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
      </aside>
      <div className="admin-layout__main">
        <header className="admin-header">
          <div className="admin-header__brand">
            <p className="admin-header__eyebrow">Pesantren Dalwa</p>
            <h1 className="admin-header__title">{screenTitles[screen]}</h1>
          </div>
          <div className="admin-header__actions">
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