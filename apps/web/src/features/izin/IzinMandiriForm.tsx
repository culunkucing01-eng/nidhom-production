import { useEffect, useState, type FormEvent } from 'react'
import { Button, Card, Input } from '../../components/ui'
import {
  ApiError,
  getGuruList,
  getKelasList,
  getMapelList,
  submitAbsen,
  submitIzin,
} from '../../lib/api'

export interface IzinMandiriFormProps {
  onBack: () => void
}

type Tab = 'izin' | 'absen'

const IZIN_JENIS = ['Sakit', 'Izin', 'Tidak Hadir'] as const
const ABSEN_STATUS = ['Izin', 'Sakit', 'Ghaib'] as const

interface OptionItem {
  id: string
  label: string
}

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

  // Opsi untuk field izin lanjutan
  const [kelasOptions, setKelasOptions] = useState<OptionItem[]>([])
  const [mapelOptions, setMapelOptions] = useState<OptionItem[]>([])
  const [guruOptions, setGuruOptions] = useState<OptionItem[]>([])
  const [selectedKelasId, setSelectedKelasId] = useState('')
  const [selectedMapelId, setSelectedMapelId] = useState('')
  const [jamTerdampak, setJamTerdampak] = useState('')
  const [guruPenggantiId, setGuruPenggantiId] = useState('')

  useEffect(() => {
    let cancelled = false
    async function loadOptions() {
      try {
        const [kelas, mapel, gurus] = await Promise.all([
          getKelasList({ per_page: 100 }),
          getMapelList({ per_page: 100 }),
          getGuruList(),
        ])
        if (cancelled) return
        setKelasOptions(
          (kelas.data as Array<{ id: string; nama: string }>).map((k) => ({
            id: k.id,
            label: k.nama,
          })),
        )
        setMapelOptions(
          (mapel.data as Array<{ id: string; nama_arab: string; nama_indo: string | null }>).map(
            (m) => ({
              id: m.id,
              label: m.nama_indo ? `${m.nama_arab} (${m.nama_indo})` : m.nama_arab,
            }),
          ),
        )
        setGuruOptions(
          (gurus as Array<{ id: string; nama: string; kode: string }>).map((g) => ({
            id: g.id,
            label: `${g.nama} (${g.kode})`,
          })),
        )
      } catch {
        /* abaikan — field opsional */
      }
    }
    loadOptions()
    return () => {
      cancelled = true
    }
  }, [])

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
        const details: Record<string, string | null> = {}
        if (selectedKelasId) details.kelas_id = selectedKelasId
        if (selectedMapelId) details.mata_pelajaran_id = selectedMapelId
        if (jamTerdampak.trim()) details.jam_terdampak = jamTerdampak.trim()
        if (guruPenggantiId) details.guru_pengganti_id = guruPenggantiId
        const res = await submitIzin(jenis, tanggal, keterangan.trim() || undefined, details)
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
      setSelectedKelasId('')
      setSelectedMapelId('')
      setJamTerdampak('')
      setGuruPenggantiId('')
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
            <>
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

              <div className="field">
                <label className="field__label" htmlFor="izin-kelas">
                  Kelas (opsional)
                </label>
                <select
                  className="field__control"
                  id="izin-kelas"
                  onChange={(e) => setSelectedKelasId(e.target.value)}
                  value={selectedKelasId}
                >
                  <option value="">— Tidak ditentukan —</option>
                  {kelasOptions.map((k) => (
                    <option key={k.id} value={k.id}>{k.label}</option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label className="field__label" htmlFor="izin-mapel">
                  Mata Pelajaran (opsional)
                </label>
                <select
                  className="field__control"
                  id="izin-mapel"
                  onChange={(e) => setSelectedMapelId(e.target.value)}
                  value={selectedMapelId}
                >
                  <option value="">— Tidak ditentukan —</option>
                  {mapelOptions.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </div>

              <Input
                id="izin-jam-terdampak"
                label="Jam Terdampak (opsional)"
                onChange={(e) => setJamTerdampak(e.target.value)}
                placeholder="mis. Jam ke-1 - 2"
                value={jamTerdampak}
              />

              <div className="field">
                <label className="field__label" htmlFor="izin-guru-pengganti">
                  Guru Pengganti (opsional)
                </label>
                <select
                  className="field__control"
                  id="izin-guru-pengganti"
                  onChange={(e) => setGuruPenggantiId(e.target.value)}
                  value={guruPenggantiId}
                >
                  <option value="">— Tidak ada —</option>
                  {guruOptions.map((g) => (
                    <option key={g.id} value={g.id}>{g.label}</option>
                  ))}
                </select>
              </div>
            </>
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
