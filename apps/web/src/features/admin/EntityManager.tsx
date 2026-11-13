import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, Card, Input } from '../../components/ui'
import './EntityManager.css'

export interface EntityColumn {
  key: string
  label: string
  render?: (row: Record<string, unknown>) => string
}

export interface EntityField {
  name: string
  label: string
  type?: 'text' | 'number'
  placeholder?: string
}

export interface EntityManagerProps {
  title: string
  subtitle?: string
  emptyHint: string
  columns: EntityColumn[]
  fields: EntityField[]
  load: (params: { page: number; perPage: number }) => Promise<{ rows: Record<string, unknown>[]; total: number }>
  create: (values: Record<string, string>) => Promise<unknown>
  update: (id: string, values: Record<string, string>) => Promise<unknown>
  remove: (id: string) => Promise<unknown>
}

const PER_PAGE = 8

function cellText(row: Record<string, unknown>, column: EntityColumn): string {
  if (column.render) return column.render(row)
  const value = row[column.key]
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function EntityManager({
  title,
  subtitle,
  emptyHint,
  columns,
  fields,
  load,
  create,
  update,
  remove,
}: EntityManagerProps) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<{ mode: 'create' } | { mode: 'edit'; id: string } | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<Record<string, unknown> | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE))

  useEffect(() => {
    let cancelled = false
    loadRef.current({ page, perPage: PER_PAGE }).then(
      (result) => {
        if (cancelled) return
        setRows(result.rows)
        setTotal(result.total)
        setError(null)
        setLoading(false)
      },
      (cause: unknown) => {
        if (cancelled) return
        setError(message(cause, 'Data tidak dapat dimuat.'))
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
      const result = await load({ page, perPage: PER_PAGE })
      setRows(result.rows)
      setTotal(result.total)
      setError(null)
    } catch (cause) {
      setError(message(cause, 'Data tidak dapat dimuat.'))
    } finally {
      setLoading(false)
    }
  }

  function openCreate() {
    setValues(Object.fromEntries(fields.map((field) => [field.name, ''])))
    setFormError(null)
    setForm({ mode: 'create' })
  }

  function openEdit(row: Record<string, unknown>) {
    const initial: Record<string, string> = {}
    for (const field of fields) {
      const value = row[field.name]
      initial[field.name] = value === null || value === undefined ? '' : String(value)
    }
    setValues(initial)
    setFormError(null)
    if (typeof row.id === 'string') setForm({ mode: 'edit', id: row.id })
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form) return
    setSaving(true)
    setFormError(null)
    try {
      if (form.mode === 'create') {
        await create(values)
      } else {
        await update(form.id, values)
      }
      setForm(null)
      await reload()
    } catch (cause) {
      setFormError(message(cause, 'Gagal menyimpan data.'))
    } finally {
      setSaving(false)
    }
  }

  function requestDelete(row: Record<string, unknown>) {
    setDeleteError(null)
    setDeleteTarget(row)
  }

  async function confirmDelete() {
    if (!deleteTarget || typeof deleteTarget.id !== 'string') return
    setDeleting(true)
    setDeleteError(null)
    try {
      await remove(deleteTarget.id)
      const wasLastOnPage = rows.length === 1 && page > 1
      setDeleteTarget(null)
      if (wasLastOnPage) {
        setPage((current) => current - 1)
      } else {
        await reload()
      }
    } catch (cause) {
      setDeleteError(message(cause, 'Gagal menghapus data.'))
    } finally {
      setDeleting(false)
    }
  }

  function gotoPage(next: number) {
    if (next < 1 || next > totalPages || next === page) return
    setLoading(true)
    setPage(next)
  }

  return (
    <div className="entity-manager">
      <div className="entity-manager__bar">
        <div>
          <h2 className="entity-manager__title">{title}</h2>
          {subtitle && <p className="entity-manager__subtitle">{subtitle}</p>}
        </div>
        <Button onClick={openCreate} variant="primary">
          + Tambah
        </Button>
      </div>

      {error && (
        <p className="entity-manager__error" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="entity-manager__hint">Memuat data…</p>
      ) : rows.length === 0 ? (
        <p className="entity-manager__hint">{emptyHint}</p>
      ) : (
        <>
          <div className="entity-table__wrapper">
            <table className="entity-table">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                  <th className="entity-table__actions-col">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={String(row.id ?? index)}>
                    {columns.map((column) => (
                      <td key={column.key}>{cellText(row, column)}</td>
                    ))}
                    <td className="entity-table__actions">
                      <Button variant="ghost" onClick={() => openEdit(row)}>
                        Edit
                      </Button>
                      <Button variant="danger" onClick={() => requestDelete(row)}>
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
              Halaman {page} dari {totalPages} · {total} data
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
          aria-label={`${form.mode === 'create' ? 'Tambah' : 'Edit'} ${title}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) setForm(null)
          }}
        >
          <Card className="entity-modal">
            <h3 className="entity-modal__title">
              {form.mode === 'create' ? `Tambah ${title}` : `Edit ${title}`}
            </h3>
            <form className="entity-modal__form" noValidate onSubmit={submit}>
              {fields.map((field) => (
                <Input
                  key={field.name}
                  id={`em-${field.name}`}
                  label={field.label}
                  placeholder={field.placeholder}
                  type={field.type === 'number' ? 'number' : 'text'}
                  value={values[field.name] ?? ''}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field.name]: event.target.value }))
                  }
                />
              ))}
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
          aria-label={`Hapus ${title}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) setDeleteTarget(null)
          }}
        >
          <Card className="entity-modal entity-modal--confirm">
            <h3 className="entity-modal__title">Hapus {title}?</h3>
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
