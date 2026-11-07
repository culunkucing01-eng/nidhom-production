import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import type { Theme } from '../../components/ui'
import { Badge, Button, Card, Input, PageHeader } from '../../components/ui'
import type { AuthenticatedUser } from '../../lib/api'
import { AdminTopbar, type AdminSection } from '../admin/AdminTopbar'
import '../guru/GuruPage.css'
import {
  createMapel,
  getMapel,
  MapelApiError,
  listMapel,
  updateMapel,
  updateMapelStatus,
  type Mapel,
  type MapelListResponse,
  type MapelStatusFilter,
} from './mapelApi'
import './MapelPage.css'

type DialogState =
  | { type: 'create' }
  | { type: 'edit'; mapel: Mapel }
  | { type: 'detail'; mapel: Mapel }
  | { type: 'status'; mapel: Mapel }
  | null

interface MapelPageProps {
  user: AuthenticatedUser
  theme: Theme
  onToggleTheme: () => void
  onLogout: () => void
  logoutLoading: boolean
  sessionMessage: string
  onNavigate: (section: AdminSection) => void
}

interface MapelFieldErrors {
  nama_arab?: string
  nama_indo?: string
}

const emptyList: MapelListResponse = {
  data: [],
  pagination: { page: 1, perPage: 10, total: 0, totalPages: 0 },
}

function getErrorMessage(error: unknown): string {
  if (error instanceof MapelApiError) {
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

export function MapelPage({
  logoutLoading,
  onLogout,
  onNavigate,
  onToggleTheme,
  sessionMessage,
  theme,
  user,
}: MapelPageProps) {
  const [list, setList] = useState<MapelListResponse>(emptyList)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<MapelStatusFilter>('active')
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionMessage, setActionMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [dialog, setDialog] = useState<DialogState>(null)
  const [dialogError, setDialogError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<MapelFieldErrors>({})
  const [refreshVersion, setRefreshVersion] = useState(0)
  const dialogTriggerRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => {
      setLoading(true)
      setLoadError('')
      listMapel({ page, perPage: 10, q: search.trim(), status }, controller.signal)
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

  function openDialog(nextDialog: DialogState, trigger: HTMLElement) {
    dialogTriggerRef.current = trigger
    setActionMessage('')
    setDialogError('')
    setFieldErrors({})
    setDialog(nextDialog)
  }

  function closeDialog() {
    setDialog(null)
    window.requestAnimationFrame(() => {
      if (dialogTriggerRef.current?.isConnected) {
        dialogTriggerRef.current.focus()
      }
    })
  }

  function setMutationError(error: unknown) {
    if (error instanceof MapelApiError) {
      setFieldErrors({
        nama_arab: error.fields?.nama_arab,
        nama_indo: error.fields?.nama_indo,
      })
      setDialogError(error.message)
      return
    }
    setFieldErrors({})
    setDialogError(getErrorMessage(error))
  }

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!dialog || (dialog.type !== 'create' && dialog.type !== 'edit')) {
      return
    }

    const form = new FormData(event.currentTarget)
    const namaArab = String(form.get('nama_arab') ?? '')
    const namaIndo = String(form.get('nama_indo') ?? '')
    const nextFieldErrors: MapelFieldErrors = {}
    if (!namaArab.trim()) {
      nextFieldErrors.nama_arab = 'Nama Arab wajib diisi.'
    }
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors)
      setDialogError('')
      return
    }

    setSaving(true)
    setDialogError('')
    setFieldErrors({})
    const values = {
      nama_arab: namaArab,
      nama_indo: namaIndo.trim() ? namaIndo : null,
    }

    try {
      if (dialog.type === 'create') {
        await createMapel(values)
        setActionMessage('Mata pelajaran berhasil ditambahkan.')
      } else {
        await updateMapel(dialog.mapel.id, values)
        setActionMessage('Perubahan mata pelajaran berhasil disimpan.')
      }
      setDialog(null)
      setPage(1)
      setRefreshVersion((current) => current + 1)
      window.requestAnimationFrame(() => {
        if (dialogTriggerRef.current?.isConnected) {
          dialogTriggerRef.current.focus()
        }
      })
    } catch (error: unknown) {
      setMutationError(error)
    } finally {
      setSaving(false)
    }
  }

  async function handleStatusChange(mapel: Mapel) {
    setSaving(true)
    setDialogError('')
    try {
      await updateMapelStatus(mapel.id, mapel.is_active !== 1)
      setActionMessage(
        mapel.is_active === 1
          ? 'Mata pelajaran berhasil dinonaktifkan.'
          : 'Mata pelajaran berhasil diaktifkan.',
      )
      setDialog(null)
      setPage(1)
      setRefreshVersion((current) => current + 1)
      window.requestAnimationFrame(() => {
        if (dialogTriggerRef.current?.isConnected) {
          dialogTriggerRef.current.focus()
        }
      })
    } catch (error: unknown) {
      setMutationError(error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="guru-shell guru-page mapel-page">
      <AdminTopbar
        currentSection="mapel"
        logoutLoading={logoutLoading}
        onLogout={onLogout}
        onNavigate={onNavigate}
        onToggleTheme={onToggleTheme}
        theme={theme}
        user={user}
      />

      <main className="guru-main" id="mapel-main">
        <PageHeader
          actions={
            <Button
              onClick={(event: MouseEvent<HTMLButtonElement>) =>
                openDialog({ type: 'create' }, event.currentTarget)
              }
              type="button"
            >
              Tambah Mata Pelajaran
            </Button>
          }
          description="Kelola nama Arab, nama Indonesia, dan status mata pelajaran."
          title="Data Mata Pelajaran"
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
              id="mapel-search"
              label="Cari nama mata pelajaran"
              maxLength={100}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
              placeholder="Cari nama Arab atau Indonesia"
              type="search"
              value={search}
            />
            <div className="guru-filter">
              <label className="field__label" htmlFor="mapel-status">
                Status
              </label>
              <select
                className="guru-select"
                id="mapel-status"
                onChange={(event) => {
                  setStatus(event.target.value as MapelStatusFilter)
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
              {loading ? 'Memuat data...' : `${list.pagination.total} mata pelajaran`}
            </p>
          </div>

          {loading ? (
            <div aria-live="polite" className="guru-state">
              <span aria-hidden="true" className="guru-spinner" />
              <p>Memuat data mata pelajaran...</p>
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
              <h2>{search ? 'Mata pelajaran tidak ditemukan' : 'Belum ada data mata pelajaran'}</h2>
              <p>
                {search
                  ? 'Coba kata kunci lain atau ubah filter status.'
                  : status === 'active'
                    ? 'Tambahkan mata pelajaran untuk mulai mengelola daftar.'
                    : 'Tidak ada mata pelajaran untuk filter status ini.'}
              </p>
            </div>
          ) : (
            <>
              <div className="guru-table-wrap">
                <table className="guru-table mapel-table">
                  <thead>
                    <tr>
                      <th scope="col">Nomor</th>
                      <th scope="col">Nama Arab</th>
                      <th scope="col">Nama Indonesia</th>
                      <th scope="col">Jadwal Aktif</th>
                      <th scope="col">Status</th>
                      <th scope="col">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.data.map((mapel, index) => (
                      <tr key={mapel.id}>
                        <td data-label="Nomor">
                          {(page - 1) * list.pagination.perPage + index + 1}
                        </td>
                        <td className="mapel-table__arabic" data-label="Nama Arab">
                          <span dir="rtl" lang="ar">{mapel.nama_arab}</span>
                        </td>
                        <td className="mapel-table__indonesian" data-label="Nama Indonesia">
                          {mapel.nama_indo?.trim() ? (
                            <span dir="ltr">{mapel.nama_indo}</span>
                          ) : (
                            <span className="mapel-empty-value">Belum diisi</span>
                          )}
                        </td>
                        <td data-label="Jadwal Aktif">{mapel.jadwal_aktif}</td>
                        <td data-label="Status">
                          <Badge variant={mapel.is_active === 1 ? 'success' : 'neutral'}>
                            {mapel.is_active === 1 ? 'Aktif' : 'Nonaktif'}
                          </Badge>
                        </td>
                        <td data-label="Tindakan">
                          <div className="guru-row-actions">
                            <Button
                              aria-label={`Lihat ${mapel.nama_arab}`}
                              className="guru-action"
                              onClick={(event: MouseEvent<HTMLButtonElement>) =>
                                openDialog({ type: 'detail', mapel }, event.currentTarget)
                              }
                              variant="ghost"
                            >
                              Detail
                            </Button>
                            <Button
                              aria-label={`Edit ${mapel.nama_arab}`}
                              className="guru-action"
                              onClick={(event: MouseEvent<HTMLButtonElement>) =>
                                openDialog({ type: 'edit', mapel }, event.currentTarget)
                              }
                              variant="ghost"
                            >
                              Edit
                            </Button>
                            <Button
                              aria-label={`${mapel.is_active === 1 ? 'Nonaktifkan' : 'Aktifkan'} ${mapel.nama_arab}`}
                              className={`guru-action${mapel.is_active === 1 ? ' guru-action--status' : ''}`}
                              onClick={(event: MouseEvent<HTMLButtonElement>) =>
                                openDialog({ type: 'status', mapel }, event.currentTarget)
                              }
                              variant="ghost"
                            >
                              {mapel.is_active === 1 ? 'Nonaktifkan' : 'Aktifkan'}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <nav aria-label="Halaman daftar mata pelajaran" className="guru-pagination">
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
        <MapelDialog
          actionError={dialogError}
          dialog={dialog}
          fieldErrors={fieldErrors}
          onClose={closeDialog}
          onSave={handleSave}
          onStatusChange={handleStatusChange}
          saving={saving}
        />
      )}
    </div>
  )
}

interface MapelDialogProps {
  dialog: Exclude<DialogState, null>
  onClose: () => void
  onSave: (event: FormEvent<HTMLFormElement>) => void
  onStatusChange: (mapel: Mapel) => void
  saving: boolean
  actionError: string
  fieldErrors: MapelFieldErrors
}

function MapelDialog({
  actionError,
  dialog,
  fieldErrors,
  onClose,
  onSave,
  onStatusChange,
  saving,
}: MapelDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [detail, setDetail] = useState(dialog.type === 'detail' ? dialog.mapel : null)
  const [detailLoading, setDetailLoading] = useState(dialog.type === 'detail')
  const [detailError, setDetailError] = useState('')

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

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', closeOnEscape, true)
    return () => document.removeEventListener('keydown', closeOnEscape, true)
  }, [onClose])

  useEffect(() => {
    if (dialog.type !== 'detail') {
      return
    }
    const controller = new AbortController()
    getMapel(dialog.mapel.id, controller.signal)
      .then((result) => setDetail(result.data))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setDetailError(getErrorMessage(error))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setDetailLoading(false)
        }
      })
    return () => controller.abort()
  }, [dialog])

  const title =
    dialog.type === 'create'
      ? 'Tambah Mata Pelajaran'
      : dialog.type === 'edit'
        ? 'Edit Mata Pelajaran'
        : dialog.type === 'detail'
          ? 'Detail Mata Pelajaran'
          : `${dialog.mapel.is_active === 1 ? 'Nonaktifkan' : 'Aktifkan'} Mata Pelajaran`

  return (
    <dialog
      aria-labelledby="mapel-dialog-title"
      className="guru-dialog mapel-dialog"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      ref={dialogRef}
    >
      <div className="guru-dialog__header">
        <h2 id="mapel-dialog-title">{title}</h2>
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
            dir="rtl"
            errorMessage={fieldErrors.nama_arab}
            id="mapel-nama-arab"
            label="Nama Arab (wajib)"
            lang="ar"
            maxLength={200}
            name="nama_arab"
            required
            defaultValue={dialog.type === 'edit' ? dialog.mapel.nama_arab : ''}
          />
          <Input
            autoComplete="off"
            dir="ltr"
            errorMessage={fieldErrors.nama_indo}
            helperText="Opsional"
            id="mapel-nama-indo"
            label="Nama Indonesia"
            maxLength={200}
            name="nama_indo"
            defaultValue={dialog.type === 'edit' ? dialog.mapel.nama_indo ?? '' : ''}
          />
          {actionError &&
            actionError !== fieldErrors.nama_arab &&
            actionError !== fieldErrors.nama_indo && (
              <p className="guru-dialog__error" role="alert">{actionError}</p>
            )}
          <div className="guru-dialog__actions">
            <Button onClick={onClose} type="button" variant="secondary">Batal</Button>
            <Button loading={saving} type="submit">
              {saving ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </form>
      ) : dialog.type === 'detail' ? (
        <div className="guru-detail">
          {detailLoading ? (
            <div aria-live="polite" className="guru-state mapel-dialog__state">
              <span aria-hidden="true" className="guru-spinner" />
              <p>Memuat detail mata pelajaran...</p>
            </div>
          ) : detailError ? (
            <div className="guru-state guru-state--error mapel-dialog__state" role="alert">
              <p>{detailError}</p>
            </div>
          ) : detail ? (
            <dl className="mapel-detail-list">
              <div><dt>Nama Arab</dt><dd dir="rtl" lang="ar">{detail.nama_arab}</dd></div>
              <div>
                <dt>Nama Indonesia</dt>
                <dd dir="ltr">
                  {detail.nama_indo?.trim() ? detail.nama_indo : 'Belum diisi'}
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>
                  <Badge variant={detail.is_active === 1 ? 'success' : 'neutral'}>
                    {detail.is_active === 1 ? 'Aktif' : 'Nonaktif'}
                  </Badge>
                </dd>
              </div>
              <div><dt>Jadwal aktif</dt><dd>{detail.jadwal_aktif}</dd></div>
              <div><dt>Dibuat</dt><dd>{formatDate(detail.created_at)}</dd></div>
              <div><dt>Diperbarui</dt><dd>{formatDate(detail.updated_at)}</dd></div>
            </dl>
          ) : null}
          <div className="guru-dialog__actions">
            <Button onClick={onClose} type="button" variant="secondary">Tutup</Button>
          </div>
        </div>
      ) : (
        <div className="guru-confirm">
          <p>
            {dialog.mapel.is_active === 1
              ? `Nonaktifkan mata pelajaran ${dialog.mapel.nama_arab}? Data mata pelajaran dan riwayat jadwal tetap tersimpan.`
              : `Aktifkan kembali mata pelajaran ${dialog.mapel.nama_arab}?`}
          </p>
          {actionError && <p className="guru-dialog__error" role="alert">{actionError}</p>}
          <div className="guru-dialog__actions">
            <Button onClick={onClose} type="button" variant="secondary">Batal</Button>
            <Button
              loading={saving}
              onClick={() => onStatusChange(dialog.mapel)}
              type="button"
              variant={dialog.mapel.is_active === 1 ? 'danger' : 'primary'}
            >
              {saving ? 'Menyimpan...' : 'Konfirmasi'}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  )
}
