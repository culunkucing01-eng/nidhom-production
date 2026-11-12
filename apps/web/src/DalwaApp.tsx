import { useEffect, useState, type FormEvent } from 'react'
import { Button, Card, Input } from './components/ui'
import {
  ApiError,
  changePassword,
  getCurrentUser,
  login,
  logout,
  teacherLogout,
  type AuthenticatedUser,
} from './lib/api'
import { LandingPage } from './features/landing/LandingPage'
import { TeacherAccess } from './features/teacher/TeacherAccess'
import { TeacherDashboard } from './features/teacher/TeacherDashboard'
import { IzinMandiriForm } from './features/izin/IzinMandiriForm'
import { AdminDashboard } from './features/admin/AdminDashboard'
import { AdminLayout } from './features/admin/AdminLayout'
import type { AdminScreen } from './features/admin/AdminLayoutContext'
import { RekapitulasiPage } from './features/rekapitulasi/RekapitulasiPage'
import './styles/earthy.css'

type Screen =
  | 'landing'
  | 'admin-login'
  | 'teacher-access'
  | 'teacher-home'
  | 'izin-form'
  | 'admin-home'
  | 'rekapitulasi'
  | 'change-password'

type Theme = 'light' | 'dark'

function toMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    return `Kesalahan (${error.status}). ${fallback}`
  }
  if (error instanceof Error) {
    return error.message
  }
  return fallback
}

function homeFor(user: AuthenticatedUser): Screen {
  return user.role === 'TEACHER' ? 'teacher-home' : 'admin-home'
}

function getInitialTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

interface PasswordFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  show: boolean
  onToggle: () => void
  autoComplete?: string
  helperText?: string
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
  helperText,
}: PasswordFieldProps) {
  const eyeOff = (
    <svg aria-hidden="true" fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="20">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" x2="23" y1="1" y2="23" />
    </svg>
  )
  const eyeOpen = (
    <svg aria-hidden="true" fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="20">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="dl-password">
        <input
          autoComplete={autoComplete}
          className="field__control"
          id={id}
          onChange={(e) => onChange(e.target.value)}
          type={show ? 'text' : 'password'}
          value={value}
        />
        <button
          aria-label={show ? `Sembunyikan ${label.toLowerCase()}` : `Tampilkan ${label.toLowerCase()}`}
          aria-pressed={show}
          className="dl-password__toggle"
          onClick={onToggle}
          type="button"
        >
          {show ? eyeOff : eyeOpen}
        </button>
      </div>
      {helperText && <p className="field__support">{helperText}</p>}
    </div>
  )
}

export default function DalwaApp() {
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [booting, setBooting] = useState(true)
  const [screen, setScreen] = useState<Screen>('landing')
  const [adminScreen, setAdminScreen] = useState<AdminScreen>('overview')
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  const [adminUser, setAdminUser] = useState('Admin')
  const [adminPass, setAdminPass] = useState('')
  const [adminLoading, setAdminLoading] = useState(false)
  const [adminError, setAdminError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [logoutLoading, setLogoutLoading] = useState(false)

  const [curPw, setCurPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwError, setPwError] = useState('')
  const [showCurPw, setShowCurPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)

  useEffect(() => {
    let cancelled = false
    getCurrentUser()
      .then((u) => {
        if (cancelled) return
        setUser(u)
        setScreen(u.mustChangePassword ? 'change-password' : homeFor(u))
      })
      .catch(() => {
        if (!cancelled) setScreen('landing')
      })
      .finally(() => {
        if (!cancelled) setBooting(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function toggleTheme() {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark'
      document.documentElement.dataset.theme = next
      return next
    })
  }

  function routeUser(u: AuthenticatedUser) {
    setUser(u)
    setScreen(u.mustChangePassword ? 'change-password' : homeFor(u))
  }

  async function handleAdminLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAdminError('')
    if (!adminUser.trim() || !adminPass) {
      setAdminError('Nama pengguna dan kata sandi wajib diisi.')
      return
    }
    setAdminLoading(true)
    try {
      routeUser(await login(adminUser.trim(), adminPass))
    } catch (e) {
      setAdminError(toMessage(e, 'Login gagal. Periksa kredensial Anda.'))
    } finally {
      setAdminLoading(false)
    }
  }

  async function handleLogout() {
    setLogoutLoading(true)
    try {
      if (user?.role === 'TEACHER') {
        await teacherLogout()
      } else {
        await logout()
      }
    } catch {
      /* abaikan: tetap keluar dari sisi klien */
    } finally {
      setLogoutLoading(false)
      setUser(null)
      setScreen('landing')
    }
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPwError('')
    if (newPw.length < 8) {
      setPwError('Kata sandi baru minimal 8 karakter.')
      return
    }
    if (newPw !== confirmPw) {
      setPwError('Konfirmasi kata sandi tidak cocok.')
      return
    }
    setPwLoading(true)
    try {
      const u = await changePassword(curPw, newPw)
      routeUser(u)
      setCurPw('')
      setNewPw('')
      setConfirmPw('')
    } catch (e) {
      setPwError(toMessage(e, 'Gagal mengubah kata sandi.'))
    } finally {
      setPwLoading(false)
    }
  }

  if (booting) {
    return (
      <div className="dl-app dl-center">
        <p className="dl-muted">Memuat sesi...</p>
      </div>
    )
  }

  if (!user) {
    if (screen === 'admin-login') {
      return (
        <div className="dl-app">
          <main className="dl-container dl-stack">
            <div className="dl-row">
              <Button onClick={() => setScreen('landing')} variant="ghost">
                ← Kembali
              </Button>
            </div>
            <Card title="Masuk Admin">
              <form className="dl-form" noValidate onSubmit={handleAdminLogin}>
                <Input
                  autoComplete="username"
                  id="admin-username"
                  label="Nama pengguna"
                  onChange={(e) => setAdminUser(e.target.value)}
                  value={adminUser}
                />
                <PasswordField
                  autoComplete="current-password"
                  id="admin-password"
                  label="Kata sandi"
                  onChange={setAdminPass}
                  onToggle={() => setShowPassword((s) => !s)}
                  show={showPassword}
                  value={adminPass}
                />
                {adminError && (
                  <p className="dl-alert dl-alert--error" role="alert">
                    {adminError}
                  </p>
                )}
                <Button className="button--block button--lg" loading={adminLoading} type="submit">
                  {adminLoading ? 'Memproses...' : 'Masuk'}
                </Button>
              </form>
            </Card>
          </main>
        </div>
      )
    }

    if (screen === 'teacher-access') {
      return (
        <div className="dl-app">
          <TeacherAccess onAuthenticated={routeUser} onBack={() => setScreen('landing')} />
        </div>
      )
    }

    return (
      <div className="dl-app">
        <LandingPage
          onAdminLogin={() => setScreen('admin-login')}
          onTeacherAccess={() => setScreen('teacher-access')}
        />
      </div>
    )
  }

  if (user.mustChangePassword) {
    return (
      <div className="dl-app">
        <main className="dl-container dl-stack">
          <h1 className="dl-section-title">Ganti Kata Sandi</h1>
          <p className="dl-muted">Demi keamanan, Anda harus mengganti kata sandi sebelum melanjutkan.</p>
          <Card>
            <form className="dl-form" noValidate onSubmit={handleChangePassword}>
              <PasswordField
                autoComplete="current-password"
                id="cur-pw"
                label="Kata sandi saat ini"
                onChange={setCurPw}
                onToggle={() => setShowCurPw((s) => !s)}
                show={showCurPw}
                value={curPw}
              />
              <PasswordField
                autoComplete="new-password"
                helperText="Minimal 8 karakter."
                id="new-pw"
                label="Kata sandi baru"
                onChange={setNewPw}
                onToggle={() => setShowNewPw((s) => !s)}
                show={showNewPw}
                value={newPw}
              />
              <PasswordField
                autoComplete="new-password"
                id="confirm-pw"
                label="Konfirmasi kata sandi baru"
                onChange={setConfirmPw}
                onToggle={() => setShowConfirmPw((s) => !s)}
                show={showConfirmPw}
                value={confirmPw}
              />
              {pwError && (
                <p className="dl-alert dl-alert--error" role="alert">
                  {pwError}
                </p>
              )}
              <Button className="button--block button--lg" loading={pwLoading} type="submit">
                {pwLoading ? 'Menyimpan...' : 'Simpan & Lanjutkan'}
              </Button>
            </form>
          </Card>
        </main>
      </div>
    )
  }

  if (user.role === 'TEACHER') {
    return (
      <div className="dl-app">
        <header className="dl-topbar">
          <div className="dl-topbar__brand">
            <span aria-hidden="true" className="dl-topbar__logo">
              N
            </span>
            <div>
              <p className="dl-topbar__title">Pesantren Dalwa</p>
              <p className="dl-topbar__sub">Jadwal &amp; Absensi</p>
            </div>
          </div>
          <div className="dl-topbar__actions">
            <span className="dl-account" dir="auto">
              {user.teacher?.name || user.username}
            </span>
            <Button aria-label="Ganti tema" onClick={toggleTheme} variant="ghost">
              {theme === 'dark' ? '☀️' : '🌙'}
            </Button>
            <Button loading={logoutLoading} onClick={handleLogout} variant="secondary">
              Keluar
            </Button>
          </div>
        </header>
        <main>
          {screen === 'izin-form' && <IzinMandiriForm onBack={() => setScreen('teacher-home')} />}
          {screen === 'rekapitulasi' && <RekapitulasiPage onBack={() => setScreen('teacher-home')} />}
          {screen === 'teacher-home' && (
            <div className="dl-container">
              <TeacherDashboard
                onNavigateIzinHistory={() => setScreen('rekapitulasi')}
                onNavigateIzinSubmit={() => setScreen('izin-form')}
                user={user}
              />
            </div>
          )}
        </main>
      </div>
    )
  }

  return (
    <AdminLayout
      logoutLoading={logoutLoading}
      onLogout={handleLogout}
      onToggleTheme={toggleTheme}
      screen={adminScreen}
      setScreen={setAdminScreen}
      theme={theme}
      user={user}
    >
      {adminScreen === 'izin' ? (
        <RekapitulasiPage onBack={() => setAdminScreen('overview')} />
      ) : (
        <AdminDashboard />
      )}
    </AdminLayout>
  )
}
