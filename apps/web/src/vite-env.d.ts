/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Base URL API backend. Kosong (default) => pakai path relatif yang di-proxy
  // oleh Vite dev server ke http://127.0.0.1:8787 (lihat vite.config.ts).
  readonly VITE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
