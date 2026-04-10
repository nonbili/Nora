import fs from 'fs/promises'
import path from 'path'
import { homedir } from 'os'
import { shouldBlockHost } from '@/lib/blocklist/parser'
import type { BlocklistSourceId, DesktopBlocklistPayload, PersistedBlocklistMatcherSnapshot } from '@/lib/blocklist/types'

const STORAGE_DIR_NAME = 'blocklist'
const MATCHER_FILENAME = 'matcher.json'
const SOURCE_FILENAMES: Record<BlocklistSourceId, string> = {
  easylist: 'easylist.txt',
  easyprivacy: 'easyprivacy.txt',
}

let enabled = false
let blockedHosts = new Set<string>()
let allowedHosts = new Set<string>()

function decodeHosts(value: string) {
  if (!value) {
    return []
  }
  return value.split('\n').filter(Boolean)
}

function getBlocklistDirPath() {
  const userDataPath = path.join(homedir(), '.config/nora')
  return path.join(userDataPath, STORAGE_DIR_NAME)
}

function getBlocklistSourcePath(id: BlocklistSourceId) {
  return path.join(getBlocklistDirPath(), SOURCE_FILENAMES[id])
}

function getBlocklistMatcherPath() {
  return path.join(getBlocklistDirPath(), MATCHER_FILENAME)
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

export function setDesktopBlocklist(payload: DesktopBlocklistPayload) {
  enabled = payload.enabled
  blockedHosts = new Set(decodeHosts(payload.blockedHosts))
  allowedHosts = new Set(decodeHosts(payload.allowedHosts))

  // TODO: Implement blocklist in Electrobun via setNavigationRules or similar
  // payload.partitions.forEach(attachPartition)
  return { revision: payload.revision }
}
