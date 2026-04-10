import { openDownloadWindow } from '../lib/download-window'
import { Session, BrowserView } from 'electrobun/bun'
import {
  deleteDesktopBlocklistMatcherSnapshot,
  deleteDesktopBlocklistSources,
  hasDesktopBlocklistSourceFiles,
  readDesktopBlocklistMatcherSnapshot,
  readDesktopBlocklistSource,
  setDesktopBlocklist,
  writeDesktopBlocklistMatcherSnapshot,
  writeDesktopBlocklistSource,
} from '../lib/blocklist'
import type { NoraRPC } from '../../shared/rpc'

export function initMainChannel(webview: BrowserView) {
  webview.rpc = BrowserView.defineRPC<NoraRPC>({
    handlers: {
      requests: {
        clearData: () => {
          Session.fromPartition('persist:webview').clearStorageData()
        },
        clearProfileData: (profile: string) => {
          if (!profile || profile === 'default') {
            return
          }

          return Session.fromPartition(`persist:${profile}`).clearStorageData()
        },
        fetchText: async (params) => {
          const { url, headers = {} } = params
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
        deleteBlocklistMatcherSnapshot: () => deleteDesktopBlocklistMatcherSnapshot(),
        deleteBlocklistSources: () => deleteDesktopBlocklistSources(),
        hasBlocklistSourceFiles: () => hasDesktopBlocklistSourceFiles(),
        readBlocklistMatcherSnapshot: () => readDesktopBlocklistMatcherSnapshot(),
        readBlocklistSource: (profile: string) => readDesktopBlocklistSource(profile),
        writeBlocklistSource: (params) => writeDesktopBlocklistSource(params.profile, params.data),
        writeBlocklistMatcherSnapshot: (data: any) => writeDesktopBlocklistMatcherSnapshot(data),
        setBlocklist: (data: any) => setDesktopBlocklist(data),
      },
    },
  })
}
