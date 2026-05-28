import { Directory, File, Paths } from 'expo-file-system'
import { isWeb } from '@/lib/utils'
import type { BlocklistSourceId, PersistedBlocklistMatcherSnapshot } from './types'

const MAIN_CHANNEL = 'channel:main'
const STORAGE_DIR_NAME = 'blocklist'
const MATCHER_FILENAME = 'matcher.json'
const SOURCE_FILENAMES: Record<BlocklistSourceId, string> = {
  easylist: 'easylist.txt',
  easyprivacy: 'easyprivacy.txt',
  braveFirstparty: 'brave-firstparty.txt',
  braveFirstpartyRegional: 'brave-firstparty-regional.txt',
}

const hasElectron = () => isWeb && typeof window !== 'undefined' && typeof window.electron !== 'undefined'

function getNativeDocumentUri() {
  if (isWeb) {
    throw new Error('Native blocklist storage is unavailable on web targets')
  }

  const documentUri = Paths.document.uri
  if (!documentUri) {
    throw new Error('Document directory is unavailable')
  }

  return documentUri
}

function getNativeBlocklistDirUri() {
  return `${getNativeDocumentUri()}${STORAGE_DIR_NAME}`
}

function getNativeBlocklistFileUri(id: BlocklistSourceId) {
  return `${getNativeBlocklistDirUri()}/${SOURCE_FILENAMES[id]}`
}

function getNativeBlocklistDir() {
  return new Directory(getNativeBlocklistDirUri())
}

function getNativeBlocklistFile(id: BlocklistSourceId) {
  return new File(getNativeBlocklistFileUri(id))
}

function getNativeMatcherFileUri() {
  return `${getNativeBlocklistDirUri()}/${MATCHER_FILENAME}`
}

function getNativeMatcherFile() {
  return new File(getNativeMatcherFileUri())
}

function parsePersistedMatcherSnapshot(raw: string | null | undefined): PersistedBlocklistMatcherSnapshot | null {
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as Partial<Record<keyof PersistedBlocklistMatcherSnapshot, unknown>>
    if (typeof parsed?.revision !== 'number') {
      return null
    }
    const blockedHostsRaw = parsed.blockedHosts
    const blockedHosts =
      typeof blockedHostsRaw === 'string'
        ? blockedHostsRaw
        : Array.isArray(blockedHostsRaw) && blockedHostsRaw.every((host) => typeof host === 'string')
          ? (blockedHostsRaw as string[]).join('\n')
          : null
    const allowedHostsRaw = parsed.allowedHosts
    const allowedHosts =
      typeof allowedHostsRaw === 'string'
        ? allowedHostsRaw
        : Array.isArray(allowedHostsRaw) && allowedHostsRaw.every((host) => typeof host === 'string')
          ? (allowedHostsRaw as string[]).join('\n')
          : null
    const cosmeticFiltersRaw = parsed.cosmeticFilters
    const cosmeticFilters =
      typeof cosmeticFiltersRaw === 'string'
        ? cosmeticFiltersRaw
        : Array.isArray(cosmeticFiltersRaw) && cosmeticFiltersRaw.every((rule) => typeof rule === 'string')
          ? (cosmeticFiltersRaw as string[]).join('\n')
          : undefined
    const cosmeticExceptionsRaw = parsed.cosmeticExceptions
    const cosmeticExceptions =
      typeof cosmeticExceptionsRaw === 'string'
        ? cosmeticExceptionsRaw
        : Array.isArray(cosmeticExceptionsRaw) && cosmeticExceptionsRaw.every((rule) => typeof rule === 'string')
          ? (cosmeticExceptionsRaw as string[]).join('\n')
          : undefined
    if (blockedHosts === null || allowedHosts === null) {
      return null
    }
    return {
      revision: parsed.revision,
      blockedHosts,
      allowedHosts,
      ...(cosmeticFilters === undefined ? {} : { cosmeticFilters }),
      ...(cosmeticExceptions === undefined ? {} : { cosmeticExceptions }),
    }
  } catch {
    return null
  }
}

export async function readBlocklistSourceFile(id: BlocklistSourceId) {
  if (hasElectron()) {
    return window.electron.ipcRenderer.invoke(MAIN_CHANNEL, 'readBlocklistSource', id)
  }

  const file = getNativeBlocklistFile(id)
  if (!file.exists) {
    return null
  }
  // Use textSync() to avoid the SharedObject release race in expo-file-system v56:
  // the async text() handle can be released between the JS File going out of scope
  // and the native read completing.
  return file.textSync()
}

export async function readBlocklistMatcherSnapshot() {
  if (hasElectron()) {
    const raw = await window.electron.ipcRenderer.invoke(MAIN_CHANNEL, 'readBlocklistMatcherSnapshot')
    return parsePersistedMatcherSnapshot(raw)
  }

  const file = getNativeMatcherFile()
  if (!file.exists) {
    return null
  }
  // See note in readBlocklistSourceFile re: textSync() vs text().
  return parsePersistedMatcherSnapshot(file.textSync())
}

export async function writeBlocklistSourceFile(id: BlocklistSourceId, body: string) {
  if (hasElectron()) {
    return window.electron.ipcRenderer.invoke(MAIN_CHANNEL, 'writeBlocklistSource', id, body)
  }

  const dir = getNativeBlocklistDir()
  if (!dir.exists) {
    dir.create({ idempotent: true, intermediates: true })
  }

  const file = getNativeBlocklistFile(id)
  if (!file.exists) {
    file.create({ overwrite: true, intermediates: true })
  }
  file.write(body)
}

export async function writeBlocklistMatcherSnapshot(snapshot: PersistedBlocklistMatcherSnapshot) {
  if (hasElectron()) {
    return window.electron.ipcRenderer.invoke(MAIN_CHANNEL, 'writeBlocklistMatcherSnapshot', snapshot)
  }

  const dir = getNativeBlocklistDir()
  if (!dir.exists) {
    dir.create({ idempotent: true, intermediates: true })
  }

  const file = getNativeMatcherFile()
  if (!file.exists) {
    file.create({ overwrite: true, intermediates: true })
  }
  file.write(JSON.stringify(snapshot))
}

export async function deleteBlocklistSourceFiles(ids: readonly BlocklistSourceId[]) {
  if (hasElectron()) {
    return window.electron.ipcRenderer.invoke(MAIN_CHANNEL, 'deleteBlocklistSources', ids)
  }

  ids.forEach((id) => {
    const file = getNativeBlocklistFile(id)
    if (file.exists) {
      file.delete()
    }
  })
}

export async function deleteBlocklistMatcherSnapshot() {
  if (hasElectron()) {
    return window.electron.ipcRenderer.invoke(MAIN_CHANNEL, 'deleteBlocklistMatcherSnapshot')
  }

  const file = getNativeMatcherFile()
  if (file.exists) {
    file.delete()
  }
}

export async function hasBlocklistSourceFiles(ids: readonly BlocklistSourceId[]) {
  if (hasElectron()) {
    return window.electron.ipcRenderer.invoke(MAIN_CHANNEL, 'hasBlocklistSourceFiles', ids)
  }

  return ids.every((id) => {
    const file = getNativeBlocklistFile(id)
    return file.exists && file.size > 0
  })
}
