import { app, ipcMain, protocol, session } from 'electron'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  WATCH_MEDIA_FILES_CHANNEL,
  WATCH_MEDIA_SCHEME,
  WATCH_PAGE_SCRIPT_CHANNEL,
  WATCH_SQLITE_CHANNEL,
} from '../ipc/constants.js'

/**
 * What the feed of watched profiles needs of the main process on desktop: a database for the
 * posts, requests made as the phone makes them, with the headers and cookies the feed chooses,
 * the photos and videos kept on disk, and the script the hidden page starts with.
 */

// Requests of their own, keeping no cookies: only those the feed sends with each are used.
const REQUEST_PARTITION = 'nora-watch-requests'
const REQUEST_TIMEOUT_MS = 30 * 1000
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000

const isSafeName = (name: unknown): name is string =>
  typeof name === 'string' && /^[A-Za-z0-9_.-]+$/.test(name) && !name.startsWith('.')

// Only Nora's own window reaches these; a page in a tab or the hidden webview does not.
const fromOwnWindow = (sender: Electron.WebContents) => sender.getType() === 'window'

// --- posts ------------------------------------------------------------------

const databases = new Map<string, DatabaseSync>()

const openDatabase = (name: string) => {
  let db = databases.get(name)
  if (!db) {
    db = new DatabaseSync(path.join(app.getPath('userData'), name))
    databases.set(name, db)
  }
  return db
}

type SqliteOp = 'exec' | 'all' | 'get' | 'run'

const runSqlite = (name: string, op: SqliteOp, source: string, params: SQLInputValue[] = []) => {
  const db = openDatabase(name)
  if (op === 'exec') {
    db.exec(source)
    return null
  }
  const statement = db.prepare(source)
  if (op === 'all') return statement.all(...params)
  if (op === 'get') return statement.get(...params) ?? null
  const { changes, lastInsertRowid } = statement.run(...params)
  return { changes: Number(changes), lastInsertRowId: Number(lastInsertRowid) }
}

// --- requests ---------------------------------------------------------------

const requests = new Map<number, AbortController>()

export interface WatchFetchInit {
  method?: string
  headers?: Record<string, string>
  body?: string
}

export interface WatchFetchAnswer {
  status: number
  url: string
  headers: Record<string, string>
  body: string
}

const requestSession = () => session.fromPartition(REQUEST_PARTITION)

// Chromium sets the request's mode itself, and fails one that names its own; the other
// headers a browser sends for a page it navigates to are kept.
const allowedHeaders = (headers: Record<string, string> = {}) =>
  Object.fromEntries(Object.entries(headers).filter(([name]) => name.toLowerCase() !== 'sec-fetch-mode'))

const withTimeout = (id: number, timeoutMs: number) => {
  const controller = new AbortController()
  requests.set(id, controller)
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer)
      requests.delete(id)
    },
  }
}

/** A request of the feed, answered with its text; the renderer cancels it with `abortWatchFetch`. */
export const watchFetch = async (id: number, url: string, init: WatchFetchInit = {}): Promise<WatchFetchAnswer> => {
  const { signal, done } = withTimeout(id, REQUEST_TIMEOUT_MS)
  try {
    const res = await requestSession().fetch(url, {
      method: init.method,
      headers: allowedHeaders(init.headers),
      body: init.body,
      credentials: 'omit',
      signal,
    })
    const headers: Record<string, string> = {}
    res.headers.forEach((value, key) => {
      headers[key] = value
    })
    // Each cookie set is a header of its own: joined, as the phone's fetch tells them.
    const cookies = res.headers.getSetCookie()
    if (cookies.length) headers['set-cookie'] = cookies.join(', ')
    return { status: res.status, url: res.url, headers, body: await res.text() }
  } finally {
    done()
  }
}

export const abortWatchFetch = (id: number) => requests.get(id)?.abort()

// --- media ------------------------------------------------------------------

const mediaDirectory = () => path.join(app.getPath('userData'), 'watch-media')

const mediaPath = (name: string) => {
  if (!isSafeName(name)) throw new Error(`bad media name ${name}`)
  return path.join(mediaDirectory(), name)
}

export const watchMediaUri = (name: string) => `${WATCH_MEDIA_SCHEME}://files/${encodeURIComponent(name)}`

/** Downloads a photo or video to keep, telling how big it is; a failed one leaves nothing behind. */
export const downloadWatchMedia = async (
  id: number,
  url: string,
  name: string,
  headers: Record<string, string> = {},
) => {
  const destination = mediaPath(name)
  fs.mkdirSync(mediaDirectory(), { recursive: true })
  const { signal, done } = withTimeout(id, DOWNLOAD_TIMEOUT_MS)
  try {
    const res = await requestSession().fetch(url, { headers: allowedHeaders(headers), credentials: 'omit', signal })
    if (!res.ok || !res.body) throw new Error(`media HTTP ${res.status}`)
    await pipeline(Readable.fromWeb(res.body as any), fs.createWriteStream(destination), { signal })
    return { uri: watchMediaUri(name), bytes: fs.statSync(destination).size }
  } catch (e) {
    fs.rmSync(destination, { force: true })
    throw e
  } finally {
    done()
  }
}

/** Puts a copy of a kept file in Downloads, under a name not already there. */
export const saveWatchMediaToDownloads = async (name: string, fileName: string) => {
  const downloads = app.getPath('downloads')
  const { name: base, ext } = path.parse(path.basename(fileName))
  let target = path.join(downloads, `${base}${ext}`)
  for (let i = 1; fs.existsSync(target); i++) target = path.join(downloads, `${base} (${i})${ext}`)
  await fs.promises.copyFile(mediaPath(name), target)
  return true
}

type MediaFilesOp = 'exists' | 'delete' | 'list' | 'clear'

const runMediaFiles = (op: MediaFilesOp, name?: string) => {
  if (op === 'exists') return fs.existsSync(mediaPath(name!))
  if (op === 'delete') {
    fs.rmSync(mediaPath(name!), { force: true })
    return null
  }
  if (op === 'list') {
    try {
      return fs.readdirSync(mediaDirectory()).filter(isSafeName)
    } catch {
      return []
    }
  }
  fs.rmSync(mediaDirectory(), { recursive: true, force: true })
  return null
}

// --- the hidden page --------------------------------------------------------

// The script each hidden webview runs at the start of its pages, by the id of its contents.
const pageScripts = new Map<number, string>()

export const setWatchPageScript = (webContentsId: number, script: string | null) => {
  if (script) pageScripts.set(webContentsId, script)
  else pageScripts.delete(webContentsId)
}

/** Whether these are the hidden webview's: what its page opens is never handed to the system. */
export const isWatchPage = (webContentsId: number) => pageScripts.has(webContentsId)

const MEDIA_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
}

/** A kept file, or the part of it asked for: a video is only seekable when its parts are answered as such. */
const serveMediaFile = (name: string, range: string | null) => {
  let size: number
  try {
    if (!isSafeName(name)) throw new Error('bad name')
    size = fs.statSync(mediaPath(name)).size
  } catch {
    return new Response(null, { status: 404 })
  }
  const headers: Record<string, string> = {
    'accept-ranges': 'bytes',
    'content-type': MEDIA_TYPES[path.extname(name).toLowerCase()] || 'application/octet-stream',
  }
  const match = range?.match(/^bytes=(\d*)-(\d*)$/)
  let start = 0
  let end = size - 1
  if (match && (match[1] || match[2])) {
    // bytes=-500 is the last 500.
    start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
    end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { ...headers, 'content-range': `bytes */${size}` } })
    }
    headers['content-range'] = `bytes ${start}-${end}/${size}`
  }
  headers['content-length'] = String(end - start + 1)
  const body = Readable.toWeb(fs.createReadStream(mediaPath(name), { start, end })) as unknown as ReadableStream
  return new Response(body, { status: headers['content-range'] ? 206 : 200, headers })
}

// --- setup ------------------------------------------------------------------

/** Before the app is ready: the kept files are served to the window, videos streamed. */
export const registerWatchMediaScheme = () => {
  protocol.registerSchemesAsPrivileged([
    { scheme: WATCH_MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ])
}

export const setupWatch = () => {
  protocol.handle(WATCH_MEDIA_SCHEME, (request) => {
    const name = decodeURIComponent(new URL(request.url).pathname.slice(1))
    return serveMediaFile(name, request.headers.get('range'))
  })

  ipcMain.on(WATCH_SQLITE_CHANNEL, (event, name: string, op: SqliteOp, source: string, params?: SQLInputValue[]) => {
    if (!fromOwnWindow(event.sender) || !isSafeName(name)) {
      event.returnValue = { error: 'not allowed' }
      return
    }
    try {
      event.returnValue = { result: runSqlite(name, op, source, params) }
    } catch (e: any) {
      event.returnValue = { error: e?.message || String(e) }
    }
  })

  ipcMain.on(WATCH_MEDIA_FILES_CHANNEL, (event, op: MediaFilesOp, name?: string) => {
    if (!fromOwnWindow(event.sender)) {
      event.returnValue = { error: 'not allowed' }
      return
    }
    try {
      event.returnValue = { result: runMediaFiles(op, name) }
    } catch (e: any) {
      event.returnValue = { error: e?.message || String(e) }
    }
  })

  // Asked by the preload of every page in a webview; only the hidden one has a script.
  ipcMain.on(WATCH_PAGE_SCRIPT_CHANNEL, (event) => {
    event.returnValue = pageScripts.get(event.sender.id) || ''
  })

  app.on('web-contents-created', (_, contents) => {
    const { id } = contents
    contents.once('destroyed', () => pageScripts.delete(id))
  })
}
