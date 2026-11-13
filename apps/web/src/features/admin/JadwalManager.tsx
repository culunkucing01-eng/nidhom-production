import { useEffect, useState, type FormEvent } from 'react'
import { Button, Card } from '../../components/ui'
import { createJadwal, deleteJadwal, getJadwalList, updateJadwal } from '../../lib/api'
import { listGuru } from '../../lib/guruApi'
import { listKelas } from '../../lib/kelasApi'
import { listMapel } from '../../features/mapel/mapelApi'
import './JadwalManager.css'

const DAYS = ['Sabtu', 'Ahad', 'Senin', 'Selasa', 'Rabu', 'Kamis']
const PERIODS = [1, 2, 3, 4]
const PER_PAGE = 8

interface Option {
  id: string
  label: string
}

interface JadwalFormValues {
  kelas_id: string
  guru_id: string
  mata_pelajaran_id: string
  day_index: string
  period: string
}

const emptyValues: JadwalFormValues = {
  kelas_id: '',
  guru_id: '',
  mata_pelajaran_id: '',
  day_index: '0',
  period: '1',
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function JadwalManager() {
  const [guruOptions, setGuruOptions] = useState<Option[]>([])
  const [kelasOptions, setKelasOptions] = useState<Option[]>([])
  const [mapelOptions, setMapelOptions] = useState<Option[]>([])

  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<{ mode: 'create' } | { mode: 'edit'; id: string } | null>(null)
  const [values, setValues] = useState<JadwalFormValues>(emptyValues)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      listGuru({ page: 1, perPage: 100, q: '', status: 'all' }),
      listKelas({ page: 1, perPage: 100, q: '', status: 'all' }),
      listMapel({ page: 1, perPage: 100, q: '', status: 'all' }),
    ])
      .then(([guru, kelas, mapel]) => {
        if (cancelled) return
        setGuruOptions(guru.data.map((item) => ({ id: item.id, label: `${item.kode} — ${item.nama}` })))
        setKelasOptions(kelas.data.map((item) => ({ id: item.id, label: item.nama })))
        setMapelOptions(
          mapel.data.map((item) => ({
            id: item.id,
            label: item.nama_indo ? `${item.nama_arab} (${item.nama_indo})` : item.nama_arab,
          })),
        )
      })
      .catch(() => {
        if (!cancelled) setError('Referensi data (guru/kelas/mapel) belum dapat dimuat.')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  useEffect(() => {
    let cancelled = false
    getJadwalList({ page, per_page: PER_PAGE }).then(
      (result) => {
        if (cancelled) return
        setRows(result.data as unknown as Record<string, unknown>[])
        setTotal(Number(result.pagination.total ?? 0))
        setLoading(false)
      },
      (cause: unknown) => {
        if (cancelled) return
        setError(message(cause, 'Data jadwal tidak dapat dimuat.'))
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [page])

  async function reload() {
    setLoading(true)
    try {
      const result = await getJadwalList({ page, per_page: PER_PAGE })
      setRows(result.data as unknown as Record<string, unknown>[])
      setTotal(Number(result.pagination.total ?? 0))
      setError(null)
    } catch (cause) {
      setError(message(cause, 'Data jadwal tidak dapat dimuat.'))
    } finally {
      setLoading(false)
    }
  }

  function openCreate() {
    setValues(emptyValues)
    setFormError(null)
    setForm({ mode: 'create' })
  }

  function openEdit(row: Record<string, unknown>) {
    setValues({
      kelas_id: String(row.kelas_id ?? ''),
      guru_id: String(row.guru_id ?? ''),
      mata_pelajaran_id: String(row.mata_pelajaran_id ?? ''),
      day_index: String(row.day_index ?? '0'),
      period: String(row.period ?? '1'),
    })
    setFormError(null)
    if (typeof row.id === 'string') setForm({ mode: 'edit', id: row.id })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form) return
    setSaving(true)
    setFormError(null)
    const input = {
      kelas_id: values.kelas_id,
      guru_id: values.guru_id,
      mata_pelajaran_id: values.mata_pelajaran_id,
      day_index: Number(values.day_index),
      period: Number(values.period),
    }
    try {
      if (form.mode === 'create') {
        await createJadwal(input)
      } else {
        await updateJadwal(form.id, input)
      }
      setForm(null)
      await reload()
    } catch (cause) {
      setFormError(message(cause, 'Gagal menyimpan jadwal.'))
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || typeof deleteTarget.id !== 'string') return
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteJadwal(deleteTarget.id)
      const wasLastOnPage = rows.length === 1 && page > 1
      setDeleteTarget(null)
      if (wasLastOnPage) {
        setPage((current) => current - 1)
      } else {
        await reload()
      }
    } catch (cause) {
      setDeleteError(message(cause, 'Gagal menghapus jadwal.'))
    } finally {
      setDeleting(false)
    }
  }

  function gotoPage(next: number) {
    if (next < 1 || next > totalPages || next === page) return
    setLoading(true)
    setPage(next)
  }

  function dayLabel(row: Record<string, unknown>): string {
    const index = Number(row.day_index)
    return DAYS[index] ?? `Hari ${index}`
  }

  return (
    <div className="entity-manager">
      <div className="entity-manager__bar">
        <div>
          <h2 className="entity-manager__title">Kelola Jadwal</h2>
          <p className="entity-manager__subtitle">Atur jadwal pelajaran per kelas, guru, dan mata pelajaran.</p>
        </div>
        <Button onClick={openCreate} variant="primary">
          + Tambah Jadwal
        </Button>
      </div>

      {error && (
        <p className="entity-manager__error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="entity-manager__hint">Memuat jadwal…</p>
      ) : rows.length === 0 ? (
        <p className="entity-manager__hint">Belum ada jadwal. Tambah jadwal atau impor dari Excel.</p>
      ) : (
        <>
          <div className="entity-table__wrapper">
            <table className="entity-table">
              <thead>
                <tr>
                  <th>Hari</th>
                  <th>Periode</th>
                  <th>Kelas</th>
                  <th>Guru</th>
                  <th>Mata Pelajaran</th>
                  <th className="entity-table__actions-col">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={String(row.id ?? index)}>
                    <td>{dayLabel(row)}</td>
                    <td>{String(row.period ?? '—')}</td>
                    <td>{String(row.kelas_nama ?? '—')}</td>
                    <td>{String(row.guru_nama ?? '—')}</td>
                    <td>{String(row.mapel_nama_arab ?? '—')}</td>
                    <td className="entity-table__actions">
                      <Button variant="ghost" onClick={() => openEdit(row)}>
                        Edit
                      </Button>
                      <Button variant="danger" onClick={() => { setDeleteError(null); setDeleteTarget(row) }}>
                        Hapus
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="entity-pagination">
            <span className="entity-pagination__info">
              Halaman {page} dari {totalPages} · {total} jadwal
            </span>
            <div className="entity-pagination__controls">
              <Button variant="secondary" onClick={() => gotoPage(page - 1)} disabled={page <= 1}>
                ‹ Sebelumnya
              </Button>
              <Button variant="secondary" onClick={() => gotoPage(page + 1)} disabled={page >= totalPages}>
                Berikutnya ›
              </Button>
            </div>
          </div>
        </>
      )}

      {form && (
        <div
          className="entity-modal__overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`${form.mode === 'create' ? 'Tambah' : 'Edit'} jadwal`}
          onClick={(event) => {
            if (event.target === event.currentTarget) setForm(null)
          }}
        >
          <Card className="entity-modal">
            <h3 className="entity-modal__title">
              {form.mode === 'create' ? 'Tambah Jadwal' : 'Edit Jadwal'}
            </h3>
            <form className="entity-modal__form" noValidate onSubmit={submit}>
              <div className="field">
                <label className="field__label" htmlFor="jadwal-kelas">Kelas</label>
                <select
                  className="field__control"
                  id="jadwal-kelas"
                  value={values.kelas_id}
                  onChange={(event) => setValues((v) => ({ ...v, kelas_id: event.target.value }))}
                >
                  <option value="">— Pilih kelas —</option>
                  {kelasOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="field__label" htmlFor="jadwal-guru">Guru</label>
                <select
                  className="field__control"
                  id="jadwal-guru"
                  value={values.guru_id}
                  onChange={(event) => setValues((v) => ({ ...v, guru_id: event.target.value }))}
                >
                  <option value="">— Pilih guru —</option>
                  {guruOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="field__label" htmlFor="jadwal-mapel">Mata Pelajaran</label>
                <select
                  className="field__control"
                  id="jadwal-mapel"
                  value={values.mata_pelajaran_id}
                  onChange={(event) => setValues((v) => ({ ...v, mata_pelajaran_id: event.target.value }))}
                >
                  <option value="">— Pilih mata pelajaran —</option>
                  {mapelOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="jadwal-form__row">
                <div className="field">
                  <label className="field__label" htmlFor="jadwal-day">Hari</label>
                  <select
                    className="field__control"
                    id="jadwal-day"
                    value={values.day_index}
                    onChange={(event) => setValues((v) => ({ ...v, day_index: event.target.value }))}
                  >
                    {DAYS.map((day, index) => (
                      <option key={day} value={String(index)}>{day}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label className="field__label" htmlFor="jadwal-period">Periode</label>
                  <select
                    className="field__control"
                    id="jadwal-period"
                    value={values.period}
                    onChange={(event) => setValues((v) => ({ ...v, period: event.target.value }))}
                  >
                    {PERIODS.map((period) => (
                      <option key={period} value={String(period)}>Periode {period}</option>
                    ))}
                  </select>
                </div>
              </div>

              {formError && (
                <p className="entity-modal__error" role="alert">
                  {formError}
                </p>
              )}
              <div className="entity-modal__actions">
                <Button type="button" variant="ghost" onClick={() => setForm(null)}>
                  Batal
                </Button>
                <Button type="submit" variant="primary" loading={saving}>
                  {saving ? 'Menyimpan…' : 'Simpan'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {deleteTarget && (
        <div
          className="entity-modal__overlay"
          role="dialog"
          aria-modal="true"
          aria-label="Hapus jadwal"
          onClick={(event) => {
            if (event.target === event.currentTarget) setDeleteTarget(null)
          }}
        >
          <Card className="entity-modal entity-modal--confirm">
            <h3 className="entity-modal__title">Hapus jadwal?</h3>
            <p className="entity-modal__confirm-text">
              Data yang dihapus tidak dapat dikembalikan. Tindakan ini bersifat permanen.
            </p>
            {deleteError && (
              <p className="entity-modal__error" role="alert">
                {deleteError}
              </p>
            )}
            <div className="entity-modal__actions">
              <Button type="button" variant="ghost" onClick={() => setDeleteTarget(null)}>
                Batal
              </Button>
              <Button type="button" variant="danger" loading={deleting} onClick={confirmDelete}>
                {deleting ? 'Menghapus…' : 'Hapus'}
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
