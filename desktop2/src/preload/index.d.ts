import { ElectronAPI } from '@electron-toolkit/preload'
import 'nora/content/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
  }
}
