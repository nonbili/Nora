import { existsSync } from 'node:fs'

// These packages receive updates through their store/package manager.
export function supportsUpdateChecks(): boolean {
  return !(
    process.windowsStore ||
    process.env.SNAP ||
    process.env.FLATPAK_ID ||
    (process.platform === 'linux' && existsSync('/.flatpak-info'))
  )
}
