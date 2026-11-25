import fs from 'fs/promises'
import path from 'path'
import { app, ipcMain, session } from 'electron'
import { BLOCKLIST_EXCLUDED_HOSTS_CHANNEL } from '../ipc/constants.js'
import type { OnBeforeRequestListenerDetails } from 'electron'
import { shouldBlockHost } from '@/lib/blocklist/parser'
import { isBlocklistExcludedHost } from '@/lib/blocklist/policy'
import type {
  BlocklistExclusionsPayload,
  BlocklistSourceId,
  DesktopBlocklistPayload,
  PersistedBlocklistMatcherSnapshot,
} from '@/lib/blocklist/types'

const attachedPartitions = new Set<string>()
const STORAGE_DIR_NAME = 'blocklist'
const MATCHER_FILENAME = 'matcher.json'
const SOURCE_FILENAMES: Record<BlocklistSourceId, string> = {
  easylist: 'easylist.txt',
  easyprivacy: 'easyprivacy.txt',
  braveFirstparty: 'brave-firstparty.txt',
  braveFirstpartyRegional: 'brave-firstparty-regional.txt',
}

let enabled = false
let blockedHosts = new Set<string>()
let allowedHosts = new Set<string>()
let excludedHosts = new Set<string>()
// Until the app has pushed its saved exceptions, the empty set above means unknown, not none.
let excludedHostsReceived = false

function decodeHosts(value: string) {
  if (!value) {
    return []
  }
  return value.split('\n').filter(Boolean)
}

function getBlocklistDirPath() {
  return path.join(app.getPath('userData'), STORAGE_DIR_NAME)
}

function getBlocklistSourcePath(id: BlocklistSourceId) {
  return path.join(getBlocklistDirPath(), SOURCE_FILENAMES[id])
}

function getBlocklistMatcherPath() {
  return path.join(getBlocklistDirPath(), MATCHER_FILENAME)
}

function getDocumentHost(details: OnBeforeRequestListenerDetails) {
  // The exception is per site, so it is the page the request belongs to that
  // decides, not the request's own host.
  try {
    // A frame that already navigated away throws when touched, so the whole
    // lookup is guarded rather than just the URL parse.
    const documentUrl = details.frame?.top?.url || details.webContents?.getURL() || details.referrer
    return documentUrl ? new URL(documentUrl).hostname : ''
  } catch {
    return ''
  }
}

function shouldCancel(details: OnBeforeRequestListenerDetails) {
  if (!enabled || details.resourceType === 'mainFrame') {
    return false
  }
  if (excludedHosts.size && isBlocklistExcludedHost(getDocumentHost(details), excludedHosts)) {
    return false
  }
  try {
    const { hostname } = new URL(details.url)
    return shouldBlockHost(hostname, blockedHosts, allowedHosts)
  } catch {
    return false
  }
}

function attachPartition(partition: string) {
  if (attachedPartitions.has(partition)) {
    return
  }
  const targetSession = session.fromPartition(partition)
  targetSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: shouldCancel(details) })
  })
  attachedPartitions.add(partition)
}

export async function readDesktopBlocklistSource(id: BlocklistSourceId) {
  try {
    return await fs.readFile(getBlocklistSourcePath(id), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export async function writeDesktopBlocklistSource(id: BlocklistSourceId, body: string) {
  await fs.mkdir(getBlocklistDirPath(), { recursive: true })
  await fs.writeFile(getBlocklistSourcePath(id), body, 'utf8')
}

export async function readDesktopBlocklistMatcherSnapshot() {
  try {
    return await fs.readFile(getBlocklistMatcherPath(), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return null
    }
    throw error
  }
}

export async function writeDesktopBlocklistMatcherSnapshot(snapshot: PersistedBlocklistMatcherSnapshot) {
  await fs.mkdir(getBlocklistDirPath(), { recursive: true })
  await fs.writeFile(getBlocklistMatcherPath(), JSON.stringify(snapshot), 'utf8')
}

export async function deleteDesktopBlocklistSources(ids: BlocklistSourceId[]) {
  await Promise.all(ids.map((id) => fs.rm(getBlocklistSourcePath(id), { force: true })))
}

export async function deleteDesktopBlocklistMatcherSnapshot() {
  await fs.rm(getBlocklistMatcherPath(), { force: true })
}

export async function hasDesktopBlocklistSourceFiles(ids: BlocklistSourceId[]) {
  const stats = await Promise.all(
    ids.map(async (id) => {
      try {
        const stat = await fs.stat(getBlocklistSourcePath(id))
        return stat.size > 0
      } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
          return false
        }
        throw error
      }
    }),
  )
  return stats.every(Boolean)
}

export function setDesktopBlocklistExcludedHosts(payload: BlocklistExclusionsPayload) {
  excludedHosts = new Set(payload.excludedHosts)
  excludedHostsReceived = true
  return { excludedHosts: payload.excludedHosts.length }
}

export function setDesktopBlocklist(payload: DesktopBlocklistPayload) {
  enabled = payload.enabled
  blockedHosts = new Set(decodeHosts(payload.blockedHosts))
  allowedHosts = new Set(decodeHosts(payload.allowedHosts))

  payload.partitions.forEach(attachPartition)
  return { revision: payload.revision }
}

/**
 * Tab preloads run guards ahead of the page's scripts (Pinterest's), before the app can
 * inject the per-site "Block ads" exceptions at dom-ready, so they ask for them here.
 * Null while a cold start is still loading them: the guard then stands down and leaves the
 * page to the main content script, rather than block ads on a site they were turned off for.
 */
export function setupBlocklistExcludedHostsChannel() {
  ipcMain.on(BLOCKLIST_EXCLUDED_HOSTS_CHANNEL, (event) => {
    event.returnValue = excludedHostsReceived ? [...excludedHosts] : null
  })
}
