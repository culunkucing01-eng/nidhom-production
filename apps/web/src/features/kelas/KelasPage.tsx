import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Theme } from '../../components/ui'
import { Badge, Button, Card, Input, PageHeader } from '../../components/ui'
import type { AuthenticatedUser } from '../../lib/api'
import {
  createKelas,
  KelasApiError,
  listKelas,
  updateKelas,
  updateKelasStatus,
  type Kelas,
  type KelasListResponse,
  type KelasStatusFilter,
} from '../../lib/kelasApi'
import { AdminTopbar } from '../admin/AdminTopbar'
import '../guru/GuruPage.css'
import './KelasPage.css'

type DialogState =
  | { type: 'create' }
  | { type: 'edit'; kelas: Kelas }
  | { type: 'detail'; kelas: Kelas }
  | { type: 'status'; kelas: Kelas }
  | null

interface KelasPageProps {
  user: AuthenticatedUser
  theme: Theme
  onToggleTheme: () => void
  onLogout: () => void
  logoutLoading: boolean
  sessionMessage: string
  onNavigateGuru: () => void
}

const emptyList: KelasListResponse = {
  data: [],
  pagination: { page: 1, perPage: 10, total: 0, totalPages: 0 },
}

function getErrorMessage(error: unknown): string {
  if (error instanceof KelasApiError) {
    return error.message
  }
  return 'Terjadi kesalahan. Silakan coba lagi.'
}

function formatDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Tidak tersedia'
  }
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export function KelasPage({
  logoutLoading,
  onLogout,
  onNavigateGuru,
  onToggleTheme,
  sessionMessage,
  theme,
  user,
}: KelasPageProps) {
  const [list, setList] = useState<KelasListResponse>(emptyList)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<KelasStatusFilter>('active')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [dialogError, setDialogError] = useState('')
  const [refreshVersion, setRefreshVersion] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setLoading(true)
      setLoadError('')
      listKelas({ page, perPage: 10, q: search.trim(), status }, controller.signal)
        .then((result) => {
          setList(result)
          if (result.pagination.totalPages > 0 && page > result.pagination.totalPages) {
            setPage(result.pagination.totalPages)
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            setLoadError(getErrorMessage(error))
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setLoading(false)
          }
        })
    }, search ? 250 : 0)

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
  }, [page, refreshVersion, search, status])

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!dialog || (dialog.type !== 'create' && dialog.type !== 'edit')) {
      return
    }

    const form = new FormData(event.currentTarget)
    const nama = String(form.get('nama') ?? '').trim()
    if (!nama) {
      setDialogError('Nama kelas wajib diisi.')
      return
    }

    setSaving(true)
    setDialogError('')
    try {
      if (dialog.type === 'create') {
        await createKelas({ nama })
        setActionMessage('Kelas berhasil ditambahkan.')
      } else {
        await updateKelas(dialog.kelas.id, { nama })
        setActionMessage('Perubahan data kelas berhasil disimpan.')
      }
      setDialog(null)
      setPage(1)
      setRefreshVersion((current) => current + 1)
    } catch (error: unknown) {
      setDialogError(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(kelas: Kelas) {
    setSaving(true)
    setDialogError('')
    try {
      await updateKelasStatus(kelas.id, kelas.is_active !== 1)
      setActionMessage(
        kelas.is_active === 1
          ? 'Kelas berhasil dinonaktifkan.'
          : 'Kelas berhasil diaktifkan.',
      )
      setDialog(null)
      setPage(1)
      setRefreshVersion((current) => current + 1)
    } catch (error: unknown) {
      setDialogError(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  function openDialog(nextDialog: DialogState) {
    setActionMessage('')
    setDialogError('')
    setDialog(nextDialog)
  }

  return (
    <div className="guru-shell guru-page kelas-page">
      <AdminTopbar
        currentSection="kelas"
        logoutLoading={logoutLoading}
        onLogout={onLogout}
        onNavigate={(section) => {
          if (section === 'guru') onNavigateGuru()
        }}
        onToggleTheme={onToggleTheme}
        theme={theme}
        user={user}
      />

      <main className="guru-main" id="kelas-main">
        <PageHeader
          actions={
            <Button onClick={() => openDialog({ type: 'create' })} type="button">
              Tambah Kelas
            </Button>
          }
          description="Kelola nama, status, dan jadwal aktif setiap kelas."
          title="Data Kelas"
        />
        {(sessionMessage || actionMessage) && (
          <div className="guru-notice" role="status">
            {actionMessage || sessionMessage}
          </div>
        )}

        <Card className="guru-card">
          <div className="guru-toolbar">
            <Input
              autoComplete="off"
              id="kelas-search"
              label="Cari nama kelas"
              maxLength={100}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="Contoh: Kelas 1A"
              type="search"
              value={search}
            />
            <div className="guru-filter">
              <label className="field__label" htmlFor="kelas-status">
                Status
              </label>
              <select
                className="guru-select"
                id="kelas-status"
                onChange={(event) => {
                  setStatus(event.target.value as KelasStatusFilter)
                  setPage(1)
                }}
                value={status}
              >
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
                <option value="all">Semua</option>
              </select>
            </div>
            <p aria-live="polite" className="guru-count">
              {loading ? 'Memuat data...' : `${list.pagination.total} kelas`}
            </p>
          </div>

          {loading ? (
            <div aria-live="polite" className="guru-state">
              <span aria-hidden="true" className="guru-spinner" />
              <p>Memuat data kelas...</p>
            </div>
          ) : loadError ? (
            <div className="guru-state guru-state--error" role="alert">
              <p>{loadError}</p>
              <Button
                onClick={() => setRefreshVersion((current) => current + 1)}
                variant="secondary"
              >
                Coba lagi
              </Button>
            </div>
          ) : list.data.length === 0 ? (
            <div className="guru-state">
              <h2>{search ? 'Kelas tidak ditemukan' : 'Belum ada data kelas'}</h2>
              <p>
                {search
                  ? 'Coba kata kunci lain atau ubah filter status.'
                  : status === 'active'
                    ? 'Tambahkan data kelas untuk mulai mengelola daftar.'
                    : 'Tidak ada kelas untuk filter status ini.'}
              </p>
            </div>
          ) : (
            <>
              <div className="guru-table-wrap">
                <table className="guru-table kelas-table">
                  <thead>
                    <tr>
                      <th scope="col">Nomor</th>
                      <th scope="col">Nama Kelas</th>
                      <th scope="col">Status</th>
                      <th scope="col">Jadwal Aktif</th>
                      <th scope="col"><span className="visually-hidden">Tindakan</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.map((kelas, index) => (
                      <tr key={kelas.id}>
                        <td data-label="Nomor">
                          {(page - 1) * list.pagination.perPage + index + 1}
                        </td>
                        <td className="guru-table__name" data-label="Nama Kelas">
                          {kelas.nama}
                        </td>
                        <td data-label="Status">
                          <Badge variant={kelas.is_active === 1 ? 'success' : 'neutral'}>
                            {kelas.is_active === 1 ? 'Aktif' : 'Nonaktif'}
                          </Badge>
                        </td>
                        <td data-label="Jadwal Aktif">{kelas.jadwal_aktif}</td>
                        <td data-label="Tindakan">
                          <div className="guru-row-actions">
                            <Button
                              aria-label={`Lihat ${kelas.nama}`}
                              className="guru-action"
                              onClick={() => openDialog({ type: 'detail', kelas })}
                              variant="ghost"
                            >
                              Detail
                            </Button>
                            <Button
                              aria-label={`Edit ${kelas.nama}`}
                              className="guru-action"
                              onClick={() => openDialog({ type: 'edit', kelas })}
                              variant="ghost"
                            >
                              Edit
                            </Button>
                            <Button
                              aria-label={`${kelas.is_active === 1 ? 'Nonaktifkan' : 'Aktifkan'} ${kelas.nama}`}
                              className={`guru-action${kelas.is_active === 1 ? ' guru-action--status' : ''}`}
                              onClick={() => openDialog({ type: 'status', kelas })}
                              variant="ghost"
                            >
                              {kelas.is_active === 1 ? 'Nonaktifkan' : 'Aktifkan'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <nav aria-label="Halaman daftar kelas" className="guru-pagination">
                <p>
                  Halaman {page} dari {Math.max(list.pagination.totalPages, 1)}
                </p>
                <div>
                  <Button
                    disabled={page <= 1 || loading}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    variant="secondary"
                  >
                    Sebelumnya
                  </Button>
                  <Button
                    disabled={page >= list.pagination.totalPages || loading}
                    onClick={() => setPage((current) => current + 1)}
                    variant="secondary"
                  >
                    Berikutnya
                  </Button>
                </div>
              </nav>
            </>
          )}
        </Card>
      </main>

      {dialog && (
        <KelasDialog
          actionError={dialogError}
          dialog={dialog}
          onClose={() => setDialog(null)}
          onSave={handleSave}
          onStatusChange={handleStatusChange}
          saving={saving}
        />
      )}
    </div>
  )
}

interface KelasDialogProps {
  dialog: Exclude<DialogState, null>
  onClose: () => void
  onSave: (event: FormEvent<HTMLFormElement>) => void
  onStatusChange: (kelas: Kelas) => void
  saving: boolean
  actionError: string
}

function KelasDialog({
  actionError,
  dialog,
  onClose,
  onSave,
  onStatusChange,
  saving,
}: KelasDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = dialogRef.current
    if (element && !element.open) {
      element.showModal()
    }
    return () => {
      if (element?.open) {
        element.close()
      }
    }
  }, [])

  const title =
    dialog.type === 'create'
      ? 'Tambah Kelas'
      : dialog.type === 'edit'
        ? 'Edit Data Kelas'
        : dialog.type === 'detail'
          ? 'Detail Kelas'
          : `${dialog.kelas.is_active === 1 ? 'Nonaktifkan' : 'Aktifkan'} Kelas`

  return (
    <dialog
      aria-labelledby="kelas-dialog-title"
      className="guru-dialog"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onClose()
        }
      }}
      ref={dialogRef}
    >
      <div className="guru-dialog__header">
        <h2 id="kelas-dialog-title">{title}</h2>
        <Button
          aria-label="Tutup dialog"
          className="guru-dialog__close"
          onClick={onClose}
          variant="ghost"
        >
          ×
        </Button>
      </div>

      {dialog.type === 'create' || dialog.type === 'edit' ? (
        <form className="guru-form" noValidate onSubmit={onSave}>
          <Input
            autoComplete="off"
            autoFocus
            defaultValue={dialog.type === 'edit' ? dialog.kelas.nama : ''}
            id="kelas-nama"
            label="Nama Kelas"
            maxLength={200}
            name="nama"
            required
          />
          {actionError && <p className="guru-dialog__error" role="alert">{actionError}</p>}
          <div className="guru-dialog__actions">
            <Button onClick={onClose} type="button" variant="secondary">Batal</Button>
            <Button loading={saving} type="submit">
              {saving ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </form>
      ) : dialog.type === 'detail' ? (
        <dl className="guru-detail">
          <div><dt>Nama Kelas</dt><dd>{dialog.kelas.nama}</dd></div>
          <div>
            <dt>Status</dt>
            <dd>
              <Badge variant={dialog.kelas.is_active === 1 ? 'success' : 'neutral'}>
                {dialog.kelas.is_active === 1 ? 'Aktif' : 'Nonaktif'}
              </Badge>
            </dd>
          </div>
          <div><dt>Jadwal aktif</dt><dd>{dialog.kelas.jadwal_aktif}</dd></div>
          <div><dt>Dibuat</dt><dd>{formatDate(dialog.kelas.created_at)}</dd></div>
          <div><dt>Diperbarui</dt><dd>{formatDate(dialog.kelas.updated_at)}</dd></div>
          <div className="guru-dialog__actions">
            <Button onClick={onClose} type="button" variant="secondary">Tutup</Button>
          </div>
        </dl>
      ) : (
        <div className="guru-confirm">
          <p>
            {dialog.kelas.is_active === 1
              ? dialog.kelas.jadwal_aktif > 0
                ? `${dialog.kelas.nama} memiliki ${dialog.kelas.jadwal_aktif} jadwal aktif. Jadwal tersebut harus ditangani terlebih dahulu sebelum kelas dapat dinonaktifkan.`
                : `Nonaktifkan kelas ${dialog.kelas.nama}? Data kelas dan seluruh riwayat jadwal tetap tersimpan.`
              : `Aktifkan kembali kelas ${dialog.kelas.nama}?`}
          </p>
          {actionError && <p className="guru-dialog__error" role="alert">{actionError}</p>}
          <div className="guru-dialog__actions">
            <Button onClick={onClose} type="button" variant="secondary">Batal</Button>
            <Button
              loading={saving}
              onClick={() => onStatusChange(dialog.kelas)}
              type="button"
              variant={dialog.kelas.is_active === 1 ? 'danger' : 'primary'}
            >
              {saving ? 'Menyimpan...' : 'Konfirmasi'}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  )
}
