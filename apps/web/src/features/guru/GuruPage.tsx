import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { Theme } from '../../components/ui'
import { Badge, Button, Card, Input, PageHeader } from '../../components/ui'
import type { AuthenticatedUser } from '../../lib/api'
import { AdminTopbar } from '../admin/AdminTopbar'
import {
  createGuru,
  GuruApiError,
  listGuru,
  updateGuru,
  updateGuruStatus,
  type Guru,
  type GuruListResponse,
  type GuruStatusFilter,
} from '../../lib/guruApi'
import './GuruPage.css'

type DialogState =
  | { type: 'create' }
  | { type: 'edit'; guru: Guru }
  | { type: 'detail'; guru: Guru }
  | { type: 'status'; guru: Guru }
  | null

interface GuruPageProps {
  user: AuthenticatedUser
  theme: Theme
  onToggleTheme: () => void
  onLogout: () => void
  logoutLoading: boolean
  sessionMessage: string
  onNavigateKelas: () => void
}

const emptyList: GuruListResponse = {
  data: [],
  pagination: { page: 1, perPage: 10, total: 0, totalPages: 0 },
}

function getErrorMessage(error: unknown): string {
  if (error instanceof GuruApiError) {
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

export function GuruPage({
  logoutLoading,
  onLogout,
  onNavigateKelas,
  onToggleTheme,
  sessionMessage,
  theme,
  user,
}: GuruPageProps) {
  const [list, setList] = useState<GuruListResponse>(emptyList)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<GuruStatusFilter>('active')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [actionError, setActionError] = useState('')
  const [saving, setSaving] = useState(false)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [refreshVersion, setRefreshVersion] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setLoading(true)
      setLoadError('')
      listGuru({ page, perPage: 10, q: search.trim(), status }, controller.signal)
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
    const kode = String(form.get('kode') ?? '').trim()
    const nama = String(form.get('nama') ?? '').trim()
    if (!kode || !nama) {
      setActionError('Kode dan nama guru wajib diisi.')
      return
    }

    setSaving(true)
    setActionError('')
    try {
      if (dialog.type === 'create') {
        await createGuru({ kode, nama })
        setActionMessage('Guru berhasil ditambahkan.')
      } else {
        await updateGuru(dialog.guru.id, { kode, nama })
        setActionMessage('Perubahan data guru berhasil disimpan.')
      }
      setDialog(null)
      setPage(1)
      setRefreshVersion((current) => current + 1)
    } catch (error: unknown) {
      setActionError(getErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(guru: Guru) {
    setSaving(true)
    setActionError('')
    try {
      await updateGuruStatus(guru.id, guru.is_active !== 1)
      setActionMessage(
        guru.is_active === 1
          ? 'Guru berhasil dinonaktifkan.'
          : 'Guru berhasil diaktifkan.',
      )
      setDialog(null)
      setPage(1)
      setRefreshVersion((current) => current + 1)
    } catch (error: unknown) {
      setActionError(getErrorMessage(error))
      setDialog(null)
    } finally {
      setSaving(false)
    }
  }

  function openDialog(nextDialog: DialogState) {
    setActionMessage('')
    setActionError('')
    setDialog(nextDialog)
  }

  const pageHeader = (
    <PageHeader
      actions={
        <Button onClick={() => openDialog({ type: 'create' })} type="button">
          Tambah Guru
        </Button>
      }
      description="Kelola identitas dan status aktif guru."
      title="Data Guru"
    />
  )

  return (
    <div className="guru-shell guru-page">
      <AdminTopbar
        currentSection="guru"
        logoutLoading={logoutLoading}
        onLogout={onLogout}
        onNavigate={(section) => {
          if (section === 'kelas') onNavigateKelas()
        }}
        onToggleTheme={onToggleTheme}
        theme={theme}
        user={user}
      />

      <main className="guru-main" id="guru-main">
        {pageHeader}
        {(sessionMessage || actionMessage || actionError) && (
          <div
            className={`guru-notice${actionError ? ' guru-notice--error' : ''}`}
            role={actionError ? 'alert' : 'status'}
          >
            {actionError || actionMessage || sessionMessage}
          </div>
        )}

        <Card className="guru-card">
          <div className="guru-toolbar">
            <Input
              autoComplete="off"
              id="guru-search"
              label="Cari nama atau kode"
              maxLength={100}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="Contoh: Ahmad atau G-001"
              type="search"
              value={search}
            />
            <div className="guru-filter">
              <label className="field__label" htmlFor="guru-status">
                Status
              </label>
              <select
                className="guru-select"
                id="guru-status"
                onChange={(event) => {
                  setStatus(event.target.value as GuruStatusFilter)
                  setPage(1)
                }}
                value={status}
              >
                <option value="active">Aktif</option>
                <option value="inactive">Nonaktif</option>
                <option value="all">Semua</option>
              </select>
            </div>
            <p className="guru-count" aria-live="polite">
              {loading ? 'Memuat data...' : `${list.pagination.total} guru`}
            </p>
          </div>

          {loading ? (
            <div aria-live="polite" className="guru-state">
              <span aria-hidden="true" className="guru-spinner" />
              <p>Memuat data guru...</p>
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
              <h2>{search ? 'Guru tidak ditemukan' : 'Belum ada data guru'}</h2>
              <p>
                {search
                  ? 'Coba kata kunci lain atau ubah filter status.'
                  : status === 'active'
                    ? 'Tambahkan data guru untuk mulai mengelola daftar.'
                    : 'Tidak ada guru untuk filter status ini.'}
              </p>
            </div>
          ) : (
            <>
              <div className="guru-table-wrap">
                <table className="guru-table">
                  <thead>
                    <tr>
                      <th scope="col">Kode</th>
                      <th scope="col">Nama Guru</th>
                      <th scope="col">Status</th>
                      <th scope="col">Diperbarui</th>
                      <th scope="col"><span className="visually-hidden">Tindakan</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.map((guru) => (
                      <tr key={guru.id}>
                        <td data-label="Kode">{guru.kode}</td>
                        <td data-label="Nama Guru" className="guru-table__name">
                          {guru.nama}
                        </td>
                        <td data-label="Status">
                          <Badge variant={guru.is_active === 1 ? 'success' : 'neutral'}>
                            {guru.is_active === 1 ? 'Aktif' : 'Nonaktif'}
                          </Badge>
                        </td>
                        <td data-label="Diperbarui" className="guru-date">
                          {formatDate(guru.updated_at)}
                        </td>
                        <td data-label="Tindakan">
                          <div className="guru-row-actions">
                            <Button
                              aria-label={`Lihat ${guru.nama}`}
                              className="guru-action"
                              onClick={() => openDialog({ type: 'detail', guru })}
                              variant="ghost"
                            >
                              Detail
                            </Button>
                            <Button
                              aria-label={`Edit ${guru.nama}`}
                              className="guru-action"
                              onClick={() => openDialog({ type: 'edit', guru })}
                              variant="ghost"
                            >
                              Edit
                            </Button>
                            <Button
                              aria-label={`${guru.is_active === 1 ? 'Nonaktifkan' : 'Aktifkan'} ${guru.nama}`}
                              className="guru-action guru-action--status"
                              onClick={() => openDialog({ type: 'status', guru })}
                              variant="ghost"
                            >
                              {guru.is_active === 1 ? 'Nonaktifkan' : 'Aktifkan'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <nav aria-label="Halaman daftar guru" className="guru-pagination">
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
        <GuruDialog
          dialog={dialog}
          onClose={() => setDialog(null)}
          onSave={handleSave}
          onStatusChange={handleStatusChange}
          saving={saving}
          actionError={actionError}
        />
      )}
    </div>
  )
}

interface GuruDialogProps {
  dialog: Exclude<DialogState, null>
  onClose: () => void
  onSave: (event: FormEvent<HTMLFormElement>) => void
  onStatusChange: (guru: Guru) => void
  saving: boolean
  actionError: string
}

function GuruDialog({
  actionError,
  dialog,
  onClose,
  onSave,
  onStatusChange,
  saving,
}: GuruDialogProps) {
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
      ? 'Tambah Guru'
      : dialog.type === 'edit'
        ? 'Edit Data Guru'
        : dialog.type === 'detail'
          ? 'Detail Guru'
          : `${dialog.guru.is_active === 1 ? 'Nonaktifkan' : 'Aktifkan'} Guru`

  return (
    <dialog
      aria-labelledby="guru-dialog-title"
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
        <h2 id="guru-dialog-title">{title}</h2>
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
            defaultValue={dialog.type === 'edit' ? dialog.guru.kode : ''}
            id="guru-kode"
            label="Kode Guru"
            maxLength={64}
            name="kode"
            required
          />
          <Input
            autoComplete="name"
            defaultValue={dialog.type === 'edit' ? dialog.guru.nama : ''}
            id="guru-nama"
            label="Nama Guru"
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
          <div><dt>Kode Guru</dt><dd>{dialog.guru.kode}</dd></div>
          <div><dt>Nama Guru</dt><dd>{dialog.guru.nama}</dd></div>
          <div>
            <dt>Status</dt>
            <dd>
              <Badge variant={dialog.guru.is_active === 1 ? 'success' : 'neutral'}>
                {dialog.guru.is_active === 1 ? 'Aktif' : 'Nonaktif'}
              </Badge>
            </dd>
          </div>
          <div><dt>Dibuat</dt><dd>{formatDate(dialog.guru.created_at)}</dd></div>
          <div><dt>Diperbarui</dt><dd>{formatDate(dialog.guru.updated_at)}</dd></div>
          <div className="guru-dialog__actions">
            <Button onClick={onClose} type="button" variant="secondary">Tutup</Button>
          </div>
        </dl>
      ) : (
        <div className="guru-confirm">
          <p>
            {dialog.guru.is_active === 1
              ? `Nonaktifkan ${dialog.guru.nama}? Data guru tetap tersimpan dan dapat diaktifkan kembali.`
              : `Aktifkan kembali ${dialog.guru.nama}?`}
          </p>
          {actionError && <p className="guru-dialog__error" role="alert">{actionError}</p>}
          <div className="guru-dialog__actions">
            <Button onClick={onClose} type="button" variant="secondary">Batal</Button>
            <Button
              loading={saving}
              onClick={() => onStatusChange(dialog.guru)}
              type="button"
              variant={dialog.guru.is_active === 1 ? 'danger' : 'primary'}
            >
              {saving ? 'Menyimpan...' : 'Konfirmasi'}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  )
}
