import type { ElectronAPI } from '@electron-toolkit/preload'

interface NoraI {
  onMessage: (payload: string) => void
  notify: (title: string, author: string, seconds: number, thumbnail: string) => void
  notifyProgress: (playing: boolean, pos: number) => void
}

declare global {
  interface Window {
    _lact: number
    NoraI: NoraI
    Nora: any
    electron: ElectronAPI
  }
}
