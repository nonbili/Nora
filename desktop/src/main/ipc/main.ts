import { openDownloadWindow } from 'main/lib/download-window.js'
import { MAIN_CHANNEL } from './constants.js'
import { ipcMain, session } from 'electron'
import { setLinkHandlingSettings } from '../lib/link-handling.js'
import {
  deleteDesktopBlocklistMatcherSnapshot,
  deleteDesktopBlocklistSources,
  hasDesktopBlocklistSourceFiles,
  readDesktopBlocklistMatcherSnapshot,
  readDesktopBlocklistSource,
  setDesktopBlocklist,
  writeDesktopBlocklistMatcherSnapshot,
  writeDesktopBlocklistSource,
} from '../lib/blocklist.js'

const interfaces = {
  clearData: () => {
    session.fromPartition('persist:webview').clearData()
  },
  clearProfileData: (profile: string) => {
    if (!profile) {
      return
    }

    return session.fromPartition(`persist:${profile}`).clearData()
  },
  clearHostData: async (profile: string, host: string) => {
    if (!profile || !host) {
      return
    }

    const ses = session.fromPartition(`persist:${profile}`)
    await ses.clearData({ origins: [`https://${host}`, `http://${host}`] })

    // clearData's origins filter does not reliably remove domain/subdomain
    // cookies, so explicitly remove cookies scoped to the host as well.
    try {
      const cookies = await ses.cookies.get({ domain: host })
      await Promise.all(
        cookies.map((cookie) => {
          const cookieHost = cookie.domain?.replace(/^\./, '') || host
          const scheme = cookie.secure ? 'https' : 'http'
          return ses.cookies.remove(`${scheme}://${cookieHost}${cookie.path || '/'}`, cookie.name)
        }),
      )
    } catch (error) {
      console.error(`Failed to clear cookies for ${host} in ${profile}`, error)
    }
  },
  fetchText: async (url: string, headers: Record<string, string> = {}) => {
    const res = await fetch(url, { headers })
    return {
      status: res.status,
      body: await res.text(),
      headers: {
        etag: res.headers.get('etag') || undefined,
        'last-modified': res.headers.get('last-modified') || undefined,
      },
    }
  },
  downloadVideo: (url: string) => {
    openDownloadWindow(url)
  },
  setCookie: async (profile: string, url: string, cookie: string) => {
    const targetProfile = profile || 'default'
    const targetUrl = new URL(url)
    const ses = session.fromPartition(`persist:${targetProfile}`)
    const items = cookie.split(';').map((x) => x.trim())

    for (const item of items) {
      const index = item.indexOf('=')
      if (index === -1) continue

      const name = item.slice(0, index)
      const value = item.slice(index + 1)
      if (!name || !value) continue

      const details: any = {
        url: targetUrl.origin,
        name,
        value,
        path: '/',
        expirationDate: Math.floor(Date.now() / 1000) + 31536000,
      }

      if (name.startsWith('__Host-')) {
        details.secure = true
      } else if (name.startsWith('__Secure-')) {
        details.secure = true
      }

      try {
        await ses.cookies.set(details)
      } catch (error) {
        console.error(`Failed to set cookie ${name} for ${targetProfile}`, error)
      }
    }
  },
  deleteBlocklistMatcherSnapshot: deleteDesktopBlocklistMatcherSnapshot,
  deleteBlocklistSources: deleteDesktopBlocklistSources,
  hasBlocklistSourceFiles: hasDesktopBlocklistSourceFiles,
  readBlocklistMatcherSnapshot: readDesktopBlocklistMatcherSnapshot,
  readBlocklistSource: readDesktopBlocklistSource,
  writeBlocklistSource: writeDesktopBlocklistSource,
  writeBlocklistMatcherSnapshot: writeDesktopBlocklistMatcherSnapshot,
  setBlocklist: setDesktopBlocklist,
  setLinkHandlingSettings,
}

export type MainInterface = typeof interfaces
type MainInterfaceKey = keyof MainInterface

function setupChannel() {
  ipcMain.handle(MAIN_CHANNEL, (_, name: string, ...args) => {
    console.log(MAIN_CHANNEL, name, JSON.stringify(args).slice(0, 100))
    const fn = interfaces[name as MainInterfaceKey]
    if (!fn) {
      console.error(`${fn} unimplemented`)
      return
    }
    // @ts-expect-error ??
    return fn(...args)
  })
}

export function initMainChannel() {
  setupChannel()
}
