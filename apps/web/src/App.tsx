import { useEffect, useState, type FormEvent } from 'react'
import type { Theme } from './components/ui'
import { Button, Card, Input, ThemeToggle } from './components/ui'
import {
  ApiError,
  changePassword,
  getCurrentUser,
  login,
  logout,
  type AuthenticatedUser,
  type UserRole,
} from './lib/api'
import { GuruPage } from './features/guru/GuruPage'
import { KelasPage } from './features/kelas/KelasPage'
import { MapelPage } from './features/mapel/MapelPage'
import { AdminNavigationProvider } from './features/admin/AdminTopbar'
import './App.css'

type Screen =
  | 'checking-session'
  | 'login'
  | 'change-password'
  | 'dashboard-unavailable'
  | 'guru'
  | 'kelas'
  | 'mapel'

interface LoginErrors {
  username?: string
  password?: string
  form?: string
}

interface PasswordErrors {
  currentPassword?: string
  newPassword?: string
  confirmation?: string
  form?: string
}

const roleDestinations: Record<UserRole, string> = {
  ADMIN: 'Dashboard Admin',
  LEADERSHIP: 'Dashboard Pimpinan',
  TEACHER: 'Dashboard Guru',
}

function getInitialTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function passwordByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function getLoginError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return 'Nama pengguna atau kata sandi tidak valid.'
    }
    if (error.status === 403) {
      return 'Permintaan ditolak oleh kebijakan origin. Periksa konfigurasi integrasi API.'
    }
    if (error.status === 400) {
      return 'Data masuk tidak dapat diproses. Periksa kembali isian Anda.'
    }
  }

  return 'Layanan belum dapat dihubungi. Periksa koneksi, lalu coba lagi.'
}

function getPasswordError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return 'Kata sandi saat ini tidak sesuai atau sesi Anda telah berakhir.'
    }
    if (error.status === 403) {
      return 'Permintaan ditolak oleh kebijakan origin. Periksa konfigurasi integrasi API.'
    }
    if (error.status === 400) {
      return 'Permintaan perubahan kata sandi tidak dapat diproses.'
    }
  }

  return 'Perubahan kata sandi belum dapat diselesaikan. Periksa koneksi, lalu coba lagi.'
}

function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [screen, setScreen] = useState<Screen>('checking-session')
  const [user, setUser] = useState<AuthenticatedUser | null>(null)
  const [sessionMessage, setSessionMessage] = useState('')
  const [loginErrors, setLoginErrors] = useState<LoginErrors>({})
  const [passwordErrors, setPasswordErrors] = useState<PasswordErrors>({})
  const [loginLoading, setLoginLoading] = useState(false)
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [logoutLoading, setLogoutLoading] = useState(false)
  const [showLoginPassword, setShowLoginPassword] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmation, setShowConfirmation] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('nidhom-theme', theme)
    } catch {
      // Theme selection remains available for the current page.
    }
  }, [theme])

  useEffect(() => {
    let active = true

    getCurrentUser()
      .then((authenticatedUser) => {
        if (active) {
          showAuthenticatedScreen(authenticatedUser)
        }
      })
      .catch((error: unknown) => {
        if (!active) {
          return
        }
        setScreen('login')
        if (!(error instanceof ApiError && error.status === 401)) {
          setSessionMessage('Sesi belum dapat diperiksa. Anda tetap dapat mencoba masuk.')
        }
      })

    return () => {
      active = false
    }
  }, [])

  function showAuthenticatedScreen(authenticatedUser: AuthenticatedUser) {
    setUser(authenticatedUser)
    setSessionMessage('')
    setScreen(
      authenticatedUser.mustChangePassword
        ? 'change-password'
        : authenticatedUser.role === 'ADMIN'
          ? 'guru'
          : 'dashboard-unavailable',
    )
  }

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors: LoginErrors = {}
    const trimmedUsername = username.trim()

    if (!trimmedUsername) {
      errors.username = 'Nama pengguna wajib diisi.'
    } else if (passwordByteLength(trimmedUsername) > 128) {
      errors.username = 'Nama pengguna terlalu panjang.'
    }

    if (!password) {
      errors.password = 'Kata sandi wajib diisi.'
    } else if (passwordByteLength(password) > 1024) {
      errors.password = 'Kata sandi melebihi batas ukuran yang didukung.'
    }

    if (Object.keys(errors).length > 0) {
      setLoginErrors(errors)
      return
    }

    setLoginErrors({})
    setSessionMessage('')
    setLoginLoading(true)
    try {
      const loginUser = await login(trimmedUsername, password)
      const authenticatedUser = await getCurrentUser()
      showAuthenticatedScreen({
        ...authenticatedUser,
        mustChangePassword:
          loginUser.mustChangePassword || authenticatedUser.mustChangePassword,
      })
      setPassword('')
    } catch (error: unknown) {
      setLoginErrors({ form: getLoginError(error) })
    } finally {
      setLoginLoading(false)
    }
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors: PasswordErrors = {}

    if (!currentPassword) {
      errors.currentPassword = 'Kata sandi saat ini wajib diisi.'
    } else if (passwordByteLength(currentPassword) > 1024) {
      errors.currentPassword = 'Kata sandi melebihi batas ukuran yang didukung.'
    }

    if (!newPassword) {
      errors.newPassword = 'Kata sandi baru wajib diisi.'
    } else if (passwordByteLength(newPassword) > 1024) {
      errors.newPassword = 'Kata sandi baru melebihi batas ukuran yang didukung.'
    }

    if (!confirmation) {
      errors.confirmation = 'Konfirmasi kata sandi baru wajib diisi.'
    } else if (newPassword !== confirmation) {
      errors.confirmation = 'Konfirmasi belum sama dengan kata sandi baru.'
    }

    if (Object.keys(errors).length > 0) {
      setPasswordErrors(errors)
      return
    }

    setPasswordErrors({})
    setPasswordLoading(true)
    try {
      await changePassword(currentPassword, newPassword)
      const authenticatedUser = await getCurrentUser()
      if (authenticatedUser.mustChangePassword) {
        setPasswordErrors({
          form: 'Perubahan belum terkonfirmasi. Hubungi administrator sebelum melanjutkan.',
        })
        return
      }

      setCurrentPassword('')
      setNewPassword('')
      setConfirmation('')
      showAuthenticatedScreen(authenticatedUser)
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 401) {
        try {
          await getCurrentUser()
          setPasswordErrors({ form: 'Kata sandi saat ini tidak sesuai.' })
        } catch (sessionError: unknown) {
          if (sessionError instanceof ApiError && sessionError.status === 401) {
            setUser(null)
            setScreen('login')
            setSessionMessage('Sesi berakhir. Masuk kembali untuk melanjutkan.')
          } else {
            setPasswordErrors({ form: getPasswordError(error) })
          }
        }
      } else {
        setPasswordErrors({ form: getPasswordError(error) })
      }
    } finally {
      setPasswordLoading(false)
    }
  }

  async function handleLogout() {
    setLogoutLoading(true)
    setSessionMessage('')
    try {
      await logout()
      setUser(null)
      setPassword('')
      setScreen('login')
      setSessionMessage('Anda telah keluar dari sesi.')
    } catch {
      setSessionMessage('Sesi belum dapat diakhiri. Periksa koneksi, lalu coba lagi.')
    } finally {
      setLogoutLoading(false)
    }
  }

  if (screen === 'guru' && user?.role === 'ADMIN') {
    return (
      <AdminNavigationProvider onNavigate={setScreen}>
        <GuruPage
          logoutLoading={logoutLoading}
          onLogout={handleLogout}
          onToggleTheme={() =>
            setTheme((current) => (current === 'light' ? 'dark' : 'light'))
          }
          sessionMessage={sessionMessage}
          theme={theme}
          user={user}
          onNavigateKelas={() => setScreen('kelas')}
        />
      </AdminNavigationProvider>
    )
  }

  if (screen === 'kelas' && user?.role === 'ADMIN') {
    return (
      <AdminNavigationProvider onNavigate={setScreen}>
        <KelasPage
          logoutLoading={logoutLoading}
          onLogout={handleLogout}
          onNavigateGuru={() => setScreen('guru')}
          onToggleTheme={() =>
            setTheme((current) => (current === 'light' ? 'dark' : 'light'))
          }
          sessionMessage={sessionMessage}
          theme={theme}
          user={user}
        />
      </AdminNavigationProvider>
    )
  }

  if (screen === 'mapel' && user?.role === 'ADMIN') {
    return (
      <AdminNavigationProvider onNavigate={setScreen}>
        <MapelPage
          logoutLoading={logoutLoading}
          onLogout={handleLogout}
          onNavigate={setScreen}
          onToggleTheme={() =>
            setTheme((current) => (current === 'light' ? 'dark' : 'light'))
          }
          sessionMessage={sessionMessage}
          theme={theme}
          user={user}
        />
      </AdminNavigationProvider>
    )
  }

  return (
    <div className="login-shell">
      <header className="login-topbar">
        <a aria-label="Nidhom, halaman masuk" className="login-brand" href="#main">
          Nidhom
        </a>
        <p className="login-product-name">Teacher Management System</p>
        <ThemeToggle
          onToggle={() => setTheme((current) => (current === 'light' ? 'dark' : 'light'))}
          theme={theme}
        />
      </header>

      <main className="login-main" id="main">
        {screen === 'checking-session' ? (
          <section aria-live="polite" className="login-status">
            <h1>Memeriksa sesi</h1>
            <p>Mohon tunggu, sesi Anda sedang diperiksa.</p>
          </section>
        ) : screen === 'change-password' ? (
          <section aria-labelledby="change-password-title" className="login-content">
            <div className="login-intro">
              <p className="login-kicker">Langkah keamanan akun</p>
              <h1 id="change-password-title">Buat kata sandi baru</h1>
              <p>
                Kata sandi sementara perlu diganti sebelum Anda melanjutkan ke aplikasi.
              </p>
            </div>
            <Card className="login-card">
              <form className="login-form" noValidate onSubmit={handleChangePassword}>
                <h2>Ganti kata sandi</h2>
                {user && (
                  <p className="login-account">
                    Akun: <strong>{user.username}</strong>
                  </p>
                )}
                <PasswordField
                  autoComplete="current-password"
                  errorMessage={passwordErrors.currentPassword}
                  id="current-password"
                  label="Kata sandi saat ini"
                  onChange={setCurrentPassword}
                  showPassword={showCurrentPassword}
                  togglePassword={() => setShowCurrentPassword((shown) => !shown)}
                  value={currentPassword}
                />
                <PasswordField
                  autoComplete="new-password"
                  errorMessage={passwordErrors.newPassword}
                  id="new-password"
                  label="Kata sandi baru"
                  onChange={setNewPassword}
                  showPassword={showNewPassword}
                  togglePassword={() => setShowNewPassword((shown) => !shown)}
                  value={newPassword}
                />
                <PasswordField
                  autoComplete="new-password"
                  errorMessage={passwordErrors.confirmation}
                  id="confirm-password"
                  label="Konfirmasi kata sandi baru"
                  onChange={setConfirmation}
                  showPassword={showConfirmation}
                  togglePassword={() => setShowConfirmation((shown) => !shown)}
                  value={confirmation}
                />
                {passwordErrors.form && (
                  <p className="form-message form-message--error" role="alert">
                    {passwordErrors.form}
                  </p>
                )}
                <Button
                  className="login-submit"
                  loading={passwordLoading}
                  type="submit"
                >
                  {passwordLoading ? 'Menyimpan perubahan...' : 'Simpan kata sandi baru'}
                </Button>
              </form>
            </Card>
          </section>
        ) : screen === 'dashboard-unavailable' && user ? (
          <section aria-labelledby="dashboard-title" className="login-content">
            <div className="login-intro">
              <p className="login-kicker">Akun terverifikasi</p>
              <h1 id="dashboard-title">Dashboard belum tersedia</h1>
              <p>
                {roleDestinations[user.role]} belum tersedia pada tahap ini. Sesi Anda
                telah masuk sebagai {user.username}.
              </p>
            </div>
            <Card className="login-card login-card--notice">
              <p className="login-account">
                Peran akun: <strong>{user.role}</strong>
              </p>
              {sessionMessage && (
                <p className="form-message" role="status">
                  {sessionMessage}
                </p>
              )}
              <Button
                className="login-submit"
                disabled={logoutLoading}
                onClick={handleLogout}
                type="button"
                variant="secondary"
              >
                {logoutLoading ? 'Mengakhiri sesi...' : 'Keluar'}
              </Button>
            </Card>
          </section>
        ) : (
          <section aria-labelledby="login-title" className="login-content">
            <div className="login-intro">
              <p className="login-kicker">Akses akun</p>
              <h1 id="login-title">Masuk ke Nidhom</h1>
              <p>Gunakan akun yang diberikan oleh administrator.</p>
            </div>
            <Card className="login-card">
              <form className="login-form" noValidate onSubmit={handleLogin}>
                <h2>Masuk</h2>
                <Input
                  autoComplete="username"
                  errorMessage={loginErrors.username}
                  id="username"
                  label="Nama pengguna"
                  maxLength={128}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  value={username}
                />
                <PasswordField
                  autoComplete="current-password"
                  errorMessage={loginErrors.password}
                  id="login-password"
                  label="Kata sandi"
                  maxLength={1024}
                  onChange={setPassword}
                  showPassword={showLoginPassword}
                  togglePassword={() => setShowLoginPassword((shown) => !shown)}
                  value={password}
                />
                {loginErrors.form && (
                  <p className="form-message form-message--error" role="alert">
                    {loginErrors.form}
                  </p>
                )}
                {sessionMessage && (
                  <p className="form-message" role="status">
                    {sessionMessage}
                  </p>
                )}
                <Button
                  className="login-submit"
                  loading={loginLoading}
                  type="submit"
                >
                  {loginLoading ? 'Memeriksa akun...' : 'Masuk'}
                </Button>
              </form>
            </Card>
          </section>
        )}
      </main>

      <footer className="login-footer">Nidhom · Teacher Management System</footer>
    </div>
  )
}

interface PasswordFieldProps {
  autoComplete: 'current-password' | 'new-password'
  errorMessage?: string
  id: string
  label: string
  maxLength?: number
  onChange: (value: string) => void
  showPassword: boolean
  togglePassword: () => void
  value: string
}

function PasswordField({
  autoComplete,
  errorMessage,
  id,
  label,
  maxLength = 1024,
  onChange,
  showPassword,
  togglePassword,
  value,
}: PasswordFieldProps) {
  return (
    <div className="password-field">
      <Input
        autoComplete={autoComplete}
        errorMessage={errorMessage}
        id={id}
        label={label}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        type={showPassword ? 'text' : 'password'}
        value={value}
      />
      <button
        aria-controls={id}
        aria-label={`${showPassword ? 'Sembunyikan' : 'Tampilkan'} ${label.toLowerCase()}`}
        className="password-toggle"
        onClick={togglePassword}
        type="button"
      >
        {showPassword ? 'Sembunyikan' : 'Tampilkan'}
      </button>
    </div>
  )
}

export default App
