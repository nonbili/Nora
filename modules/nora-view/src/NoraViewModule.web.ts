import { registerWebModule, NativeModule } from 'expo'
import { mainClient } from '@/desktop/src/renderer/ipc/main'

class NoraViewModule extends NativeModule {
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
}

export default registerWebModule(NoraViewModule, 'NoraViewModule')
