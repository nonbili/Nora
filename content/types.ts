import type { ElectronAPI } from '@electron-toolkit/preload'

interface NoraI {
  onMessage: (payload: string) => void
}

declare global {
  interface Window {
    NoraI: NoraI
    Nora: any
    electron: ElectronAPI
  }
}
