import { registerWebModule, NativeModule } from 'expo'
import { mainClient } from '@/desktop/src/renderer/ipc/main'

class NoraViewModule extends NativeModule {
  async translateText() {
    throw new Error('Translation is available on mobile only')
  }

  async getTranslationSupportedLanguages() {
    return []
  }
  async clearProfileData(profile: string) {
    if (!window.electron?.ipcRenderer) {
      return
    }

    await mainClient.clearProfileData(profile)
  }

  async clearHostData(profile: string, host: string) {
    if (!window.electron?.ipcRenderer) {
      return
    }

    await mainClient.clearHostData(profile, host)
  }

  async getCookies(url: string, profile?: string | null) {
    if (!window.electron?.ipcRenderer) {
      return ''
    }

    return mainClient.getCookies(profile || '', url)
  }

  // A photo or video the feed keeps, copied to Downloads.
  async saveFileToDownloads(sourceUri: string, fileName: string, _mimeType?: string | null) {
    const name = decodeURIComponent(new URL(sourceUri).pathname.slice(1))
    return mainClient.saveWatchMediaToDownloads(name, fileName)
  }

  async showItemInFolder(path: string) {
    await mainClient.showItemInFolder(path)
  }
}

export default registerWebModule(NoraViewModule, 'NoraViewModule')
