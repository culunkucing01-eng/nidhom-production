import { useCallback, useEffect, useState } from 'react'
import { Badge, Button } from '../../components/ui'
import {
  adminPendingIzin,
  decideIzin,
  getGuruListForAdmin,
  getKelasList,
  getMapelList,
  type IzinRecord,
} from '../../lib/api'
import './IzinApprovalPanel.css'

interface Opt {
  id: string
  label: string
}

interface Props {
  refreshKey: number
  onActionComplete?: () => void
}

export function IzinApprovalPanel({ refreshKey, onActionComplete }: Props) {
  const [items, setItems] = useState<IzinRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actingId, setActingId] = useState<string | null>(null)
  const [adjustMode, setAdjustMode] = useState(false)
  const [notes, setNotes] = useState('')
  const [kelasOpts, setKelasOpts] = useState<Opt[]>([])
  const [mapelOpts, setMapelOpts] = useState<Opt[]>([])
  const [guruOpts, setGuruOpts] = useState<Opt[]>([])
  const [adjKelas, setAdjKelas] = useState('')
  const [adjMapel, setAdjMapel] = useState('')
  const [adjJam, setAdjJam] = useState('')
  const [adjGuru, setAdjGuru] = useState('')

  const fetchItems = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await adminPendingIzin()
      setItems(res.data ?? [])
    } catch {
      setError('Gagal memuat pengajuan izin.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [k, m, g] = await Promise.all([
          getKelasList({ per_page: 100 }),
          getMapelList({ per_page: 100 }),
          getGuruListForAdmin({ per_page: 100 }),
        ])
        if (cancelled) return
        setKelasOpts(
          (k.data as Array<{ id: string; nama: string }>).map((x) => ({ id: x.id, label: x.nama })),
        )
        setMapelOpts(
          (m.data as Array<{ id: string; nama_arab: string; nama_indo: string | null }>).map(
            (x) => ({ id: x.id, label: x.nama_indo ? `${x.nama_arab} (${x.nama_indo})` : x.nama_arab }),
          ),
        )
        setGuruOpts(
          (g.data as Array<{ id: string; nama: string; kode: string }>).map((x) => ({
            id: x.id,
            label: `${x.nama} (${x.kode})`,
          })),
        )
      } catch {
        /* abaikan */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems, refreshKey])

  function start(id: string, adjust: boolean) {
    setActingId(id)
    setAdjustMode(adjust)
    setNotes('')
    setAdjKelas('')
    setAdjMapel('')
    setAdjJam('')
    setAdjGuru('')
  }

  function cancel() {
    setActingId(null)
    setAdjustMode(false)
  }

  async function decide(id: string, d: 'DISETUJUI' | 'DITOLAK' | 'DISESUAIKAN') {
    const details: Record<string, string | null> = {}
    if (d === 'DISESUAIKAN') {
      details.kelas_id = adjKelas || null
      details.mata_pelajaran_id = adjMapel || null
      details.jam_terdampak = adjJam.trim() || null
      details.guru_pengganti_id = adjGuru || null
    }
    try {
      await decideIzin(id, d, notes.trim() || undefined, details)
      setActingId(null)
      setAdjustMode(false)
      await fetchItems()
      onActionComplete?.()
    } catch {
      setError('Gagal memproses keputusan.')
    }
  }

  return (
    <div className="izin-panel">
      {error && <p className="izin-panel__error" role="alert">{error}</p>}
      {loading ? (
        <p className="izin-panel__status">Memuat pengajuanâ€¦</p>
      ) : items.length === 0 ? (
        <p className="izin-panel__status izin-panel__status--empty">
          Tidak ada pengajuan menunggu persetujuan.
        </p>
      ) : (
        <ul className="izin-panel__list">
          {items.map((item) => (
            <li className="izin-panel__item" key={item.id}>
              <div className="izin-panel__item-header">
                <span className="izin-panel__ref">{item.ref_code}</span>
                <Badge variant="warning">{item.status}</Badge>
              </div>
              <div className="izin-panel__item-body">
                <p className="izin-panel__guru" dir="auto">
                  <strong>{item.guru_nama || 'â€”'}</strong>
                </p>
                <p>{item.jenis} Â· {item.tanggal}</p>
                {item.keterangan && <p className="izin-panel__ket">{item.keterangan}</p>}
              </div>

              {actingId === item.id ? (
                <div className="izin-panel__form">
                  <textarea
                    className="izin-panel__notes"
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Catatan keputusan (opsional)"
                    rows={2}
                    value={notes}
                  />
                  {adjustMode && (
                    <div className="izin-panel__adjust-fields">
                      <label>
                        <span>Kelas</span>
                        <select onChange={(e) => setAdjKelas(e.target.value)} value={adjKelas}>
                          <option value="">â€” Pilih kelas â€”</option>
                          {kelasOpts.map((k) => (
                            <option key={k.id} value={k.id}>{k.label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Mata Pelajaran</span>
                        <select onChange={(e) => setAdjMapel(e.target.value)} value={adjMapel}>
                          <option value="">â€” Pilih mapel â€”</option>
                          {mapelOpts.map((m) => (
                            <option key={m.id} value={m.id}>{m.label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>Jam Terdampak</span>
                        <input
                          onChange={(e) => setAdjJam(e.target.value)}
                          placeholder="mis. Jam ke-1-2"
                          type="text"
                          value={adjJam}
                        />
                      </label>
                      <label>
                        <span>Guru Pengganti</span>
                        <select onChange={(e) => setAdjGuru(e.target.value)} value={adjGuru}>
                          <option value="">â€” Pilih guru â€”</option>
                          {guruOpts.map((g) => (
                            <option key={g.id} value={g.id}>{g.label}</option>
                          ))}
                        </select>
                      </label>
                    </div>
                  )}
                  <div className="izin-panel__actions">
                    {adjustMode ? (
                      <>
                        <Button onClick={() => decide(item.id, 'DISESUAIKAN')} variant="primary">
                          Konfirmasi Penyesuaian
                        </Button>
                        <Button onClick={cancel} variant="ghost">Batal</Button>
                      </>
                    ) : (
                      <>
                        <Button onClick={() => decide(item.id, 'DISETUJUI')} variant="primary">
                          Setujui
                        </Button>
                        <Button onClick={() => decide(item.id, 'DITOLAK')} variant="secondary">
                          Tolak
                        </Button>
                        <Button onClick={() => start(item.id, true)} variant="ghost">
                          Sesuaikanâ€¦
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="izin-panel__actions">
                  <Button onClick={() => start(item.id, false)} variant="primary">
                    Proses
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
