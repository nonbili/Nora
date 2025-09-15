import { platform, is } from '@electron-toolkit/utils'
import childProcess from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

const templateDesktopFile = (exec: string, icon: string) => `[Desktop Entry]
Name=Nora
Exec=${exec} %u
Type=Application
Categories=AudioVideo;Network;Utility;
Icon=${icon}
MimeType=x-scheme-handler/nora;
`

export async function genDesktopFile() {
  if (!platform.isLinux || is.dev) {
    return
  }

  const iconSrcPath = path.join(__dirname, '../../../app.asar.unpacked/resources/icon.png')
  const iconDstDir = path.join(os.homedir(), '.local/share/icons')
  await fs.mkdir(iconDstDir, { recursive: true })
  const iconDstpath = path.join(iconDstDir, 'nora.png')
  await fs.copyFile(iconSrcPath, iconDstpath)

  const desktopPath = path.join(os.homedir(), '.local/share/applications/nora.desktop')
  await fs.writeFile(desktopPath, templateDesktopFile(process.env.APPIMAGE!, iconDstpath))
  // https://github.com/electron-userland/electron-builder/issues/4035#issuecomment-512331963
  childProcess.exec('xdg-mime default nora.desktop x-scheme-handler/nora')
}
