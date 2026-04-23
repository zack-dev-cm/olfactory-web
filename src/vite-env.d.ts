/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SEOGEO_BRIDGE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface TelegramWebApp {
  initData?: string
  initDataUnsafe?: {
    start_param?: string
    [key: string]: unknown
  }
}

interface Window {
  Telegram?: {
    WebApp?: TelegramWebApp
  }
}
