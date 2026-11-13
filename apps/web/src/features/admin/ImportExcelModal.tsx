import { useState, type ChangeEvent } from 'react'
import { Button, Card } from '../../components/ui'
import {
  commitAllImport,
  commitImport,
  inspectImport,
  validateImport,
  type CommitAllResponse,
  type ImportSheetPreview,
  type PlanResponse,
} from '../../lib/importApi'
import './ImportExcelModal.css'

const ENTITY_OPTIONS = [
  { value: 'guru', label: 'Guru' },
  { value: 'kelas', label: 'Kelas' },
  { value: 'mapel', label: 'Mata Pelajaran' },
  { value: 'jadwal', label: 'Jadwal' },
  { value: 'perizinan', label: 'Perizinan' },
  { value: 'absen', label: 'Absen' },
]

type Phase = 'idle' | 'inspect' | 'validate' | 'commit' | 'all'

interface ImportExcelModalProps {
  onClose: () => void
  onImported?: () => void
}

export function ImportExcelModal({ onClose, onImported }: ImportExcelModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [sheets, setSheets] = useState<ImportSheetPreview[]>([])
  const [sheetName, setSheetName] = useState('')
  const [entityType, setEntityType] = useState('guru')
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [phase, setPhase] = useState<Phase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [plan, setPlan] = useState<PlanResponse | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [allResult, setAllResult] = useState<CommitAllResponse['sheets'] | null>(null)

  const busy = phase !== 'idle'

  function pickFile(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] ?? null)
    setSheets([])
    setSheetName('')
    setMapping({})
    setPlan(null)
    setDone(null)
    setError(null)
  }

  function selectSheet(sheet: ImportSheetPreview) {
    setSheetName(sheet.name)
    setEntityType(sheet.suggestedEntityType || 'guru')
    setMapping(sheet.suggestedMapping ?? {})
    setPlan(null)
  }

  async function inspect() {
    if (!file) return
    setPhase('inspect')
    setError(null)
    setPlan(null)
    setDone(null)
    try {
      const result = await inspectImport(file)
      setSheets(result.sheets)
      const first = result.sheets.find((sheet) => !sheet.hidden) ?? result.sheets[0]
      if (first) selectSheet(first)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal memeriksa file.')
    } finally {
      setPhase('idle')
    }
  }

  async function validate() {
    if (!file || !sheetName) return
    setPhase('validate')
    setError(null)
    setDone(null)
    try {
      setPlan(await validateImport(file, sheetName, entityType, mapping))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal memvalidasi data.')
    } finally {
      setPhase('idle')
    }
  }

  async function commit() {
    if (!file || !sheetName) return
    setPhase('commit')
    setError(null)
    try {
      const result = await commitImport(file, sheetName, entityType, mapping)
      setPlan({ summary: result.summary, issues: result.issues })
      setDone(
        `Impor selesai — ${result.summary.inserted} baru, ${result.summary.updated} diperbarui, ${result.summary.duplicates} duplikat, ${result.summary.failed} gagal.`,
      )
      onImported?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal menyimpan impor.')
    } finally {
      setPhase('idle')
    }
  }

  async function importAll() {
    if (!file) return
    setPhase('all')
    setError(null)
    setDone(null)
    setAllResult(null)
    try {
      const result = await commitAllImport(file)
      setAllResult(result.sheets)
      onImported?.()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Gagal mengimpor semua sheet.')
    } finally {
      setPhase('idle')
    }
  }

  return (
    <div
      className="import-modal__overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Impor data Excel"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <Card className="import-modal">
        <div className="import-modal__head">
          <h2 className="import-modal__title">Impor Data (Excel / CSV)</h2>
          <button type="button" className="import-modal__close" onClick={onClose} aria-label="Tutup">
            ✕
          </button>
        </div>

        <div className="import-modal__body">
          <div className="field">
            <label className="field__label" htmlFor="import-file">
              File .xlsx / .csv (maks 2 MB)
            </label>
            <input
              accept=".xlsx,.xls,.csv"
              className="field__control"
              id="import-file"
              onChange={pickFile}
              type="file"
            />
          </div>

          <div className="import-modal__row">
            <Button
              disabled={!file || busy}
              loading={phase === 'inspect'}
              onClick={inspect}
              type="button"
              variant="secondary"
            >
              Periksa File
            </Button>
          </div>

          <div className="import-modal__row">
            <Button
              disabled={!file || busy}
              loading={phase === 'all'}
              onClick={importAll}
              type="button"
              variant="primary"
            >
              Impor Semua Sheet Sekaligus
            </Button>
          </div>

          {allResult && (
            <div className="import-modal__summary">
              <p className="import-modal__summary-line">Hasil impor semua sheet:</p>
              <ul className="import-modal__issues">
                {allResult.map((sheet) => (
                  <li key={sheet.sheet}>
                    {sheet.sheet} ({sheet.entityType}) — total {sheet.summary.totalRows}: {sheet.summary.inserted} baru, {sheet.summary.updated} diperbarui, {sheet.summary.duplicates} duplikat, {sheet.summary.failed} gagal
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sheets.length > 0 && (
            <div className="import-modal__sheets">
              <div className="field">
                <label className="field__label" htmlFor="import-sheet">
                  Sheet
                </label>
                <select
                  className="field__control"
                  id="import-sheet"
                  onChange={(event) => {
                    const sheet = sheets.find((item) => item.name === event.target.value)
                    if (sheet) selectSheet(sheet)
                  }}
                  value={sheetName}
                >
                  {sheets.map((sheet) => (
                    <option key={sheet.name} value={sheet.name}>
                      {sheet.name}
                      {sheet.hidden ? ' (tersembunyi)' : ''} — {sheet.rowCount} baris
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="field__label" htmlFor="import-entity">
                  Jenis data
                </label>
                <select
                  className="field__control"
                  id="import-entity"
                  onChange={(event) => setEntityType(event.target.value)}
                  value={entityType}
                >
                  {ENTITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="import-modal__row">
                <Button
                  disabled={!file || !sheetName || busy}
                  loading={phase === 'validate'}
                  onClick={validate}
                  type="button"
                  variant="ghost"
                >
                  Validasi
                </Button>
                <Button
                  disabled={!file || !sheetName || busy}
                  loading={phase === 'commit'}
                  onClick={commit}
                  type="button"
                  variant="primary"
                >
                  Impor Sekarang
                </Button>
              </div>
            </div>
          )}

          {error && (
            <p className="import-modal__error" role="alert">
              {error}
            </p>
          )}
          {done && (
            <p className="import-modal__done" role="status">
              {done}
            </p>
          )}

          {plan && (
            <div className="import-modal__summary">
              <p className="import-modal__summary-line">
                Total {plan.summary.totalRows} baris · {plan.summary.inserted} baru ·{' '}
                {plan.summary.updated} diperbarui · {plan.summary.duplicates} duplikat ·{' '}
                {plan.summary.failed} gagal
              </p>
              {plan.issues.length > 0 && (
                <ul className="import-modal__issues">
                  {plan.issues.slice(0, 12).map((issue, index) => (
                    <li key={`${issue.row}-${index}`}>
                      Baris {issue.row}
                      {issue.column ? ` · ${issue.column}` : ''}: {issue.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </Card>
    </div>
  )
}
