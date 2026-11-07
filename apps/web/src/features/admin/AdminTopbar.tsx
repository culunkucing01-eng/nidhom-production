import { createContext, useContext, type ReactNode } from 'react'
import { Button, ThemeToggle } from '../../components/ui'
import type { AuthenticatedUser } from '../../lib/api'
import './AdminTopbar.css'

export type AdminSection = 'guru' | 'kelas' | 'mapel'

const AdminNavigationContext = createContext<((section: AdminSection) => void) | null>(null)

interface AdminNavigationProviderProps {
  onNavigate: (section: AdminSection) => void
  children: ReactNode
}

export function AdminNavigationProvider({
  children,
  onNavigate,
}: AdminNavigationProviderProps) {
  return (
    <AdminNavigationContext.Provider value={onNavigate}>
      {children}
    </AdminNavigationContext.Provider>
  )
}

interface AdminTopbarProps {
  user: AuthenticatedUser
  theme: 'light' | 'dark'
  currentSection: AdminSection
  logoutLoading: boolean
  onToggleTheme: () => void
  onLogout: () => void
  onNavigate: (section: AdminSection) => void
}

const sectionLabels: Record<AdminSection, string> = {
  guru: 'Data Guru',
  kelas: 'Data Kelas',
  mapel: 'Mata Pelajaran',
}

export function AdminTopbar({
  currentSection,
  logoutLoading,
  onLogout,
  onNavigate,
  onToggleTheme,
  theme,
  user,
}: AdminTopbarProps) {
  const sharedNavigation = useContext(AdminNavigationContext)

  return (
    <header className="guru-topbar">
      <a
        aria-label={`Nidhom, ${sectionLabels[currentSection]}`}
        className="guru-brand"
        href={
          currentSection === 'guru'
            ? '#guru-main'
            : currentSection === 'kelas'
              ? '#kelas-main'
              : '#mapel-main'
        }
      >
        Nidhom
      </a>
      <p className="guru-product-name">Teacher Management System</p>
      <nav aria-label="Navigasi data utama" className="guru-admin-nav">
        {(Object.keys(sectionLabels) as AdminSection[]).map((section) => (
          <button
            aria-current={currentSection === section ? 'page' : undefined}
            className="guru-admin-nav__link"
            key={section}
            onClick={() => (sharedNavigation ?? onNavigate)(section)}
            type="button"
          >
            {sectionLabels[section]}
          </button>
        ))}
      </nav>
      <div className="guru-topbar__actions">
        <ThemeToggle onToggle={onToggleTheme} theme={theme} />
        <span className="guru-account">{user.username}</span>
        <Button
          disabled={logoutLoading}
          onClick={onLogout}
          type="button"
          variant="secondary"
        >
          {logoutLoading ? 'Keluar...' : 'Keluar'}
        </Button>
      </div>
    </header>
  )
}
