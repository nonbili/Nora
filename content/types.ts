import type { ElectronAPI } from '@electron-toolkit/preload'

interface NoraI {
  onMessage: (payload: string) => void
  notify: (title: string, author: string, seconds: number, thumbnail: string) => void
  notifyProgress: (playing: boolean, pos: number) => void
  /** Android only, and only on builds that ship the pull to refresh gesture. */
  setScrolledRegions?: (rects: string) => void
}

declare global {
  interface Window {
    _lact: number
    NoraI: NoraI
    Nora: any
    /** Sites ad blocking is off for, injected at document start. */
    __noraBlocklistExcludedHosts?: string[]
    electron: ElectronAPI
  }
}
