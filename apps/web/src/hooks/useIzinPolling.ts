import { useEffect, useRef } from 'react'
import { adminPendingIzin, getMyIzin, type IzinRecord } from '../lib/api'
import { playNotificationSound } from '../lib/soundManager'

const TEACHER_POLL_MS = 30_000
const ADMIN_POLL_MS = 20_000

/**
 * Polling di sisi guru: mendeteksi perubahan status pengajuan izin
 * dari PENDING menjadi DISETUJUI / DITOLAK / DISESUAIKAN.
 * Memainkan suara notifikasi saat perubahan terdeteksi.
 */
export function useTeacherIzinPolling(
  onDecision: (izin: IzinRecord) => void,
  enabled = true,
) {
  const callbackRef = useRef(onDecision)
  callbackRef.current = onDecision
  const prevStatuses = useRef<Map<string, string>>(new Map())
  const initialized = useRef(false)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function poll() {
      try {
        const res = await getMyIzin({ per_page: 10 })
        if (cancelled) return
        const items = res.data ?? []

        if (!initialized.current) {
          // Polling pertama: cukup rekam status baseline.
          for (const item of items) {
            prevStatuses.current.set(item.id, item.status)
          }
          initialized.current = true
          return
        }

        for (const item of items) {
          const prev = prevStatuses.current.get(item.id)
          if (
            prev === 'PENDING' &&
            (item.status === 'DISETUJUI' ||
              item.status === 'DITOLAK' ||
              item.status === 'DISESUAIKAN')
          ) {
            callbackRef.current(item)
            playNotificationSound()
          }
          prevStatuses.current.set(item.id, item.status)
        }
      } catch {
        /* abaikan error polling */
      }
    }

    poll()
    const interval = setInterval(poll, TEACHER_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [enabled])
}

/**
 * Polling di sisi admin: mendeteksi pengajuan izin PENDING baru.
 * Memainkan suara notifikasi saat ada pengajuan baru.
 */
export function useAdminIzinPolling(
  onNewPending: (items: IzinRecord[]) => void,
  enabled = true,
) {
  const callbackRef = useRef(onNewPending)
  callbackRef.current = onNewPending
  const seenIds = useRef<Set<string>>(new Set())
  const initialized = useRef(false)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function poll() {
      try {
        const res = await adminPendingIzin()
        if (cancelled) return
        const items = res.data ?? []

        if (!initialized.current) {
          for (const item of items) {
            seenIds.current.add(item.id)
          }
          initialized.current = true
          return
        }

        const newItems = items.filter((item) => !seenIds.current.has(item.id))
        for (const item of items) {
          seenIds.current.add(item.id)
        }

        if (newItems.length > 0) {
          callbackRef.current(newItems)
          playNotificationSound()
        }
      } catch {
        /* abaikan error polling */
      }
    }

    poll()
    const interval = setInterval(poll, ADMIN_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [enabled])
}
