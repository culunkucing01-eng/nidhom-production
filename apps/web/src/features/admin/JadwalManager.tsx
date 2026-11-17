import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { Button, Card, Badge } from '../../components/ui'
import { createJadwal, deleteJadwal, getJadwalList, updateJadwal, type JadwalItem } from '../../lib/api'
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

interface JadwalRecord extends JadwalItem {
  kelas_id: string
  guru_id: string
  mata_pelajaran_id: string
  day_index: number
  is_active?: number | null
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

  const [rows, setRows] = useState<JadwalRecord[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [filterDay, setFilterDay] = useState<string>('all')
  const [filterKelas, setFilterKelas] = useState<string>('all')

  const [form, setForm] = useState<{ mode: 'create' } | { mode: 'edit'; id: string } | null>(null)
  const [values, setValues] = useState<JadwalFormValues>(emptyValues)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<JadwalRecord | null>(null)
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

  const reload = useCallback(async (targetPage: number) => {
    setLoading(true)
    try {
      const result = await getJadwalList({ page: targetPage, per_page: PER_PAGE })
      setRows((result.data ?? []) as JadwalRecord[])
      setTotal(Number(result.pagination?.total ?? 0))
      setError(null)
    } catch (cause) {
      setError(message(cause, 'Data jadwal tidak dapat dimuat.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    getJadwalList({ page, per_page: PER_PAGE }).then(
      (result) => {
        if (cancelled) return
        setRows((result.data ?? []) as JadwalRecord[])
        setTotal(Number(result.pagination?.total ?? 0))
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

  function openCreate() {
    setValues(emptyValues)
    setFormError(null)
    setForm({ mode: 'create' })
  }

  function openEdit(row: JadwalRecord) {
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
      await reload(page)
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
        await reload(page)
      }
    } catch (cause) {
      setDeleteError(message(cause, 'Gagal menghapus jadwal.'))
    } finally {
      setDeleting(false)
    }
  }

  function gotoPage(next: number) {
    if (next < 1 || next > totalPages || next === page) return
    setPage(next)
  }

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const dayMatch = filterDay === 'all' || String(row.day_index) === filterDay
      const kelasMatch = filterKelas === 'all' || row.kelas_id === filterKelas
      return dayMatch && kelasMatch
    })
  }, [rows, filterDay, filterKelas])

  function dayLabel(row: JadwalRecord): string {
    const index = Number(row.day_index)
    return DAYS[index] ?? `Hari ${index}`
  }

  function guruLabel(row: JadwalRecord): string {
    const nama = row.guru_nama ?? '—'
    const kode = row.guru_kode
    return kode ? `${nama} (${kode})` : nama
  }

  function mapelLabel(row: JadwalRecord): string {
    return row.mapel_nama_arab ?? row.mapel_nama_indo ?? '—'
  }

  function isActive(row: JadwalRecord): boolean {
    return row.is_active === undefined || row.is_active === null
      ? true
      : Number(row.is_active) === 1
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

      <div className="jadwal-filters">
        <div className="field">
          <label className="field__label" htmlFor="jadwal-filter-day">Filter Hari</label>
          <select
            className="field__control"
            id="jadwal-filter-day"
            value={filterDay}
            onChange={(event) => setFilterDay(event.target.value)}
          >
            <option value="all">Semua Hari</option>
            {DAYS.map((day, index) => (
              <option key={day} value={String(index)}>{day}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field__label" htmlFor="jadwal-filter-kelas">Filter Kelas</label>
          <select
            className="field__control"
            id="jadwal-filter-kelas"
            value={filterKelas}
            onChange={(event) => setFilterKelas(event.target.value)}
          >
            <option value="all">Semua Kelas</option>
            {kelasOptions.map((option) => (
              <option key={option.id} value={option.id}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p className="entity-manager__error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="entity-manager__hint">Memuat jadwal…</p>
      ) : filteredRows.length === 0 ? (
        <p className="entity-manager__hint">
          {rows.length === 0
            ? 'Belum ada jadwal. Tambah jadwal atau impor dari Excel.'
            : 'Tidak ada jadwal yang cocok dengan filter yang dipilih.'}
        </p>
      ) : (
        <>
          <div className="entity-table__wrapper">
            <table className="entity-table">
              <thead>
                <tr>
                  <th scope="col">Hari</th>
                  <th scope="col">Jam / Periode</th>
                  <th scope="col">Kelas</th>
                  <th scope="col">Mata Pelajaran</th>
                  <th scope="col">Guru</th>
                  <th scope="col">Status</th>
                  <th scope="col"><span className="visually-hidden">Tindakan</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.id}>
                    <td data-label="Hari">{dayLabel(row)}</td>
                    <td data-label="Jam / Periode">Periode {String(row.period ?? '—')}</td>
                    <td data-label="Kelas">{row.kelas_nama ?? '—'}</td>
                    <td data-label="Mata Pelajaran">{mapelLabel(row)}</td>
                    <td data-label="Guru">{guruLabel(row)}</td>
                    <td data-label="Status">
                      <Badge variant={isActive(row) ? 'success' : 'neutral'}>
                        {isActive(row) ? 'Aktif' : 'Nonaktif'}
                      </Badge>
                    </td>
                    <td className="entity-table__actions" data-label="Tindakan">
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
