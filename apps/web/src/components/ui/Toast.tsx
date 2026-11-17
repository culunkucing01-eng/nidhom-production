import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import './Toast.css'

export type ToastVariant = 'success' | 'error' | 'info' | 'warning'

interface ToastItem {
  id: number
  message: string
  variant: ToastVariant
}

const ToastContext = createContext<{
  toast: (msg: string, variant?: ToastVariant) => void
} | null>(null)

let toastIdCounter = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map())

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const toast = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      const id = ++toastIdCounter
      setToasts((prev) => [...prev.slice(-4), { id, message, variant }])
      const timer = setTimeout(() => dismiss(id), 4500)
      timers.current.set(id, timer)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div aria-label="Notifikasi" aria-live="polite" className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.variant}`} role="alert">
            <span className="toast__message">{t.message}</span>
            <button
              aria-label="Tutup notifikasi"
              className="toast__close"
              onClick={() => dismiss(t.id)}
              type="button"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast harus digunakan di dalam ToastProvider.')
  return ctx
}
