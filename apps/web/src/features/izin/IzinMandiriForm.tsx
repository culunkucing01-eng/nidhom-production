import { useState, type FormEvent } from 'react'
import { Button, Card, Input } from '../../components/ui'
import { ApiError, submitAbsen, submitIzin } from '../../lib/api'

export interface IzinMandiriFormProps {
  onBack: () => void
}

type Tab = 'izin' | 'absen'

const IZIN_JENIS = ['Sakit', 'Izin', 'Tidak Hadir'] as const
const ABSEN_STATUS = ['Izin', 'Sakit', 'Ghaib'] as const

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function toMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `Gagal mengirim (kode ${error.status}). Periksa data dan coba lagi.`
  }
  if (error instanceof Error) {
    return error.message
  }
  return 'Terjadi kesalahan. Silakan coba lagi.'
}

export function IzinMandiriForm({ onBack }: IzinMandiriFormProps) {
  const [tab, setTab] = useState<Tab>('izin')
  const [jenis, setJenis] = useState<string>(IZIN_JENIS[0])
  const [status, setStatus] = useState<string>(ABSEN_STATUS[0])
  const [tanggal, setTanggal] = useState(todayStr())
  const [keterangan, setKeterangan] = useState('')
  const [rincianJam, setRincianJam] = useState('')
  const [jumlahJam, setJumlahJam] = useState('')
  const [mataPelajaran, setMataPelajaran] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSuccess('')

    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
      setError('Format tanggal tidak sah (YYYY-MM-DD).')
      return
    }

    setSubmitting(true)
    try {
      if (tab === 'izin') {
        const res = await submitIzin(jenis, tanggal, keterangan.trim() || undefined)
        setSuccess(`Pengajuan izin terkirim. Kode referensi: ${res.ref_code}`)
      } else {
        const trimmedJam = jumlahJam.trim()
        const jam = trimmedJam === '' ? undefined : Number(trimmedJam)
        if (jam !== undefined && (!Number.isInteger(jam) || jam < 0)) {
          setError('Jumlah jam harus berupa angka ≥ 0.')
          setSubmitting(false)
          return
        }
        await submitAbsen({
          status,
          tanggal,
          rincian_jam: rincianJam.trim() || undefined,
          jumlah_jam: jam,
          mata_pelajaran: mataPelajaran.trim() || undefined,
          keterangan: keterangan.trim() || undefined,
        })
        setSuccess('Catatan absen berhasil dikirim.')
      }
      setKeterangan('')
      setRincianJam('')
      setJumlahJam('')
      setMataPelajaran('')
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="dl-container dl-stack">
      <header className="dl-row">
        <Button onClick={onBack} variant="ghost">
          ← Kembali
        </Button>
        <div className="dl-grow">
          <h1 className="dl-section-title">Formulir Izin Mandiri</h1>
          <p className="dl-muted">Ajukan izin atau catat ketidakhadiran Anda.</p>
        </div>
      </header>

      <div aria-label="Jenis formulir" className="dl-tabs" role="tablist">
        <button
          aria-selected={tab === 'izin'}
          className={`dl-tab ${tab === 'izin' ? 'is-active' : ''}`}
          onClick={() => {
            setTab('izin')
            setError('')
            setSuccess('')
          }}
          role="tab"
          type="button"
        >
          Pengajuan Izin
        </button>
        <button
          aria-selected={tab === 'absen'}
          className={`dl-tab ${tab === 'absen' ? 'is-active' : ''}`}
          onClick={() => {
            setTab('absen')
            setError('')
            setSuccess('')
          }}
          role="tab"
          type="button"
        >
          Catat Absen
        </button>
      </div>

      <Card>
        <form className="dl-form" noValidate onSubmit={handleSubmit}>
          {tab === 'izin' ? (
            <div className="field">
              <span className="field__label">Jenis Izin</span>
              <div className="dl-choices">
                {IZIN_JENIS.map((j) => (
                  <button
                    aria-pressed={jenis === j}
                    className={`dl-choice ${jenis === j ? 'is-active' : ''}`}
                    key={j}
                    onClick={() => setJenis(j)}
                    type="button"
                  >
                    {j}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              <div className="field">
                <span className="field__label">Status Absen</span>
                <div className="dl-choices">
                  {ABSEN_STATUS.map((s) => (
                    <button
                      aria-pressed={status === s}
                      className={`dl-choice ${status === s ? 'is-active' : ''}`}
                      key={s}
                      onClick={() => setStatus(s)}
                      type="button"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <Input
                dir="auto"
                id="absen-mapel"
                label="Mata pelajaran (opsional)"
                onChange={(e) => setMataPelajaran(e.target.value)}
                placeholder="مثال: الفقه"
                value={mataPelajaran}
              />
              <Input
                id="absen-rincian"
                label="Rincian jam (opsional)"
                onChange={(e) => setRincianJam(e.target.value)}
                placeholder="Jam ke-1 - 2"
                value={rincianJam}
              />
              <Input
                id="absen-jumlah"
                inputMode="numeric"
                label="Jumlah jam (opsional)"
                onChange={(e) => setJumlahJam(e.target.value)}
                placeholder="2"
                value={jumlahJam}
              />
            </>
          )}

          <Input
            id="form-tanggal"
            label="Tanggal"
            onChange={(e) => setTanggal(e.target.value)}
            type="date"
            value={tanggal}
          />

          <div className="field">
            <label className="field__label" htmlFor="form-keterangan">
              Keterangan (opsional)
            </label>
            <textarea
              className="field__control"
              id="form-keterangan"
              onChange={(e) => setKeterangan(e.target.value)}
              placeholder="Tulis alasan secara singkat..."
              rows={3}
              value={keterangan}
            />
          </div>

          {error && (
            <p className="dl-alert dl-alert--error" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="dl-alert dl-alert--success" role="alert">
              {success}
            </p>
          )}

          <Button className="button--block button--lg" loading={submitting} type="submit">
            {submitting ? 'Mengirim...' : tab === 'izin' ? 'Kirim Pengajuan' : 'Simpan Absen'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
