import { createContext, useContext } from 'react'

export type AdminScreen = 'overview' | 'izin'

export const AdminLayoutContext = createContext<{
  screen: AdminScreen
  setScreen: (screen: AdminScreen) => void
} | null>(null)

export function useAdminSection() {
  const ctx = useContext(AdminLayoutContext)
  if (!ctx) {
    throw new Error('useAdminSection must be used within AdminLayout')
  }
  return ctx
}
