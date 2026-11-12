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
  placeholder?: string
}

export interface EntityManagerProps {
  title: string
  subtitle?: string
  emptyHint: string
  columns: EntityColumn[]
  fields: EntityField[]
  load: () => Promise<Record<string, unknown>[]>
  create: (values: Record<string, string>) => Promise<unknown>
}

function cellText(row: Record<string, unknown>, column: EntityColumn): string {
  if (column.render) return column.render(row)
  const value = row[column.key]
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

export function EntityManager({
  title,
  subtitle,
  emptyHint,
  columns,
  fields,
  load,
  create,
}: EntityManagerProps) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const loadRef = useRef(load)
  useEffect(() => {
    loadRef.current = load
  })

  useEffect(() => {
    let cancelled = false
    loadRef.current().then(
      (result) => {
        if (cancelled) return
        setRows(result)
        setError(null)
        setLoading(false)
      },
      (cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof Error ? cause.message : 'Data tidak dapat dimuat.')
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  async function reload() {
    setLoading(true)
    setError(null)
    try {
      setRows(await load())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Data tidak dapat dimuat.')
    } finally {
      setLoading(false)
    }
  }

  function openForm() {
    setValues(Object.fromEntries(fields.map((field) => [field.name, ''])))
    setFormError(null)
    setFormOpen(true)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setFormError(null)
    try {
      await create(values)
      setFormOpen(false)
      await reload()
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'Gagal menyimpan data.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="entity-manager">
      <div className="entity-manager__bar">
        <div>
          <h2 className="entity-manager__title">{title}</h2>
          {subtitle && <p className="entity-manager__subtitle">{subtitle}</p>}
        </div>
        <Button onClick={openForm} variant="primary">
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
        <div className="entity-table__wrapper">
          <table className="entity-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={String(row.id ?? index)}>
                  {columns.map((column) => (
                    <td key={column.key}>{cellText(row, column)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <div
          className="entity-modal__overlay"
          role="dialog"
          aria-modal="true"
          aria-label={`Tambah ${title}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) setFormOpen(false)
          }}
        >
          <Card className="entity-modal">
            <h3 className="entity-modal__title">Tambah {title}</h3>
            <form className="entity-modal__form" noValidate onSubmit={submit}>
              {fields.map((field) => (
                <Input
                  key={field.name}
                  id={`em-${field.name}`}
                  label={field.label}
                  placeholder={field.placeholder}
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
                <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
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
    </div>
  )
}
