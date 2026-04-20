import path from 'path'
import fs from 'fs'
import { app, Session } from 'electron'
import { uiClient } from '../ipc/ui'
import { getPref, setPref } from './prefs'

function getLastDownloadDir(): string {
  const dir = getPref('lastDownloadDir')
  if (dir && fs.existsSync(dir)) return dir
  return app.getPath('downloads')
}

const attached = new WeakSet<Session>()

export function attachDownloadHandler(ses: Session) {
  if (attached.has(ses)) return
  attached.add(ses)

  ses.on('will-download', (_event, item) => {
    const filename = item.getFilename()
    item.setSaveDialogOptions({
      defaultPath: path.join(getLastDownloadDir(), filename),
    })
    item.on('done', (_e, state) => {
      const savePath = item.getSavePath()
      if (state === 'completed') {
        if (savePath) setPref('lastDownloadDir', path.dirname(savePath))
        uiClient.showToast(`Download finished: ${savePath}`)
      } else if (state === 'interrupted') {
        uiClient.showToast(`Download failed: ${savePath}`)
      }
    })
  })
}
