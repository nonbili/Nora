import { observable, syncState, when } from '@legendapp/state'
import NoraViewModule from '@/modules/nora-view'
import { isWeb, isIos, isAndroid } from '@/lib/utils'
import { settings$ } from '@/states/settings'
import { autoProfiles$ } from '@/states/auto-profiles'
import { blocklist$ } from '@/states/blocklist'
import { BLOCKLIST_PARSER_VERSION, mergeFilterListsText, mergeFilterListsAsync } from './parser'
import { isBlocklistExcludedHost, shouldAutoRefresh } from './policy'
import { createWorkletRuntime, runOnRuntime, type WorkletRuntime } from 'react-native-worklets'
import {
  deleteBlocklistMatcherSnapshot,
  deleteBlocklistSourceFiles,
  hasBlocklistSourceFiles,
  readBlocklistMatcherSnapshot,
  readBlocklistSourceFile,
  writeBlocklistMatcherSnapshot,
  writeBlocklistSourceFile,
} from './storage'
import {
  BLOCKLIST_SOURCE_IDS,
  BlocklistExclusionsPayload,
  BlocklistFetchSourceResult,
  BlocklistMatcherData,
  BlocklistPayload,
  BlocklistSnapshot,
  BlocklistSourceId,
  DesktopBlocklistPayload,
  PersistedBlocklistMatcherSnapshot,
  RemoteTextResponse,
} from './types'

const MAIN_CHANNEL = 'channel:main'
const BLOCKLIST_FETCH_TIMEOUT_MS = 20_000
const BLOCKLIST_WORKLET_TIMEOUT_MS = 8_000

const hasElectron = () => isWeb && typeof window !== 'undefined' && typeof window.electron !== 'undefined'

let payloadCache:
  | {
      revision: number
      matcherData: BlocklistMatcherData
      payload: BlocklistPayload
    }
  | undefined

export const blocklistMatcherRevision$ = observable(0)

let workletRuntime: WorkletRuntime | undefined
if (isAndroid) {
  try {
    workletRuntime = createWorkletRuntime('blocklist')
  } catch (err) {
    console.error('[blocklist] Failed to create worklet runtime', err)
  }
}

const readHeader = (headers: Record<string, string | undefined>, key: string) =>
  headers[key] || headers[key.toLowerCase()] || headers[key.toUpperCase()]

function decodeHosts(value: string) {
  if (!value) {
    return []
  }
  return value
    .split('\n')
    .map((host) => host.trim())
    .filter(Boolean)
}

async function fetchRemoteText(url: string, headers: Record<string, string> = {}): Promise<RemoteTextResponse> {
  const controller = new AbortController()
  const timeoutError = new Error(`Timed out fetching blocklist after ${Math.round(BLOCKLIST_FETCH_TIMEOUT_MS / 1000)}s`)
  let timerId: ReturnType<typeof setTimeout> | undefined

  const fetchPromise = (async () => {
    try {
      if (hasElectron()) {
        // An IPC invoke cannot be aborted from here; the main process applies
        // the same deadline to its own request, and this race keeps the
        // renderer from waiting forever if it does not answer.
        return (await window.electron.ipcRenderer.invoke(MAIN_CHANNEL, 'fetchText', url, headers)) as RemoteTextResponse
      }

      const res = await fetch(url, { headers, signal: controller.signal })
      if (!res.ok && res.status !== 304) {
        throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`)
      }
      const body = await res.text()
      return {
        status: res.status,
        body,
        headers: {
          etag: res.headers.get('etag') || undefined,
          'last-modified': res.headers.get('last-modified') || undefined,
        },
      }
    } finally {
      if (timerId) {
        clearTimeout(timerId)
      }
    }
  })()

  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => {
      controller.abort()
      reject(timeoutError)
    }, BLOCKLIST_FETCH_TIMEOUT_MS)
  })

  try {
    return await Promise.race([fetchPromise, timeoutPromise])
  } catch (error) {
    if (error === timeoutError || (error instanceof Error && error.name === 'AbortError')) {
      throw timeoutError
    }
    throw error
  }
}

function getDesktopPartitions() {
  const partitions = settings$.profiles.get().map((profile) => `persist:${profile.id}`)
  const autoPartitions = autoProfiles$.profiles.get().map((profile) => `persist:${profile.id}`)
  return Array.from(new Set(['persist:default', ...partitions, ...autoPartitions])).sort()
}

function emptyPayload(revision: number): BlocklistPayload {
  return {
    enabled: false,
    blockedHosts: '',
    allowedHosts: '',
    cosmeticFilters: '',
    cosmeticExceptions: '',
    revision,
  }
}

function encodeHosts(hosts: string[]) {
  return hosts.join('\n')
}

function serializePayload(matcherData: BlocklistMatcherData): BlocklistPayload {
  return {
    enabled: matcherData.enabled,
    blockedHosts: encodeHosts(matcherData.blockedHosts),
    allowedHosts: encodeHosts(matcherData.allowedHosts),
    cosmeticFilters: encodeHosts(matcherData.cosmeticFilters),
    cosmeticExceptions: encodeHosts(matcherData.cosmeticExceptions),
    revision: matcherData.revision,
  }
}

function setPayloadCache(matcherData: BlocklistMatcherData) {
  payloadCache = {
    revision: matcherData.revision,
    matcherData,
    payload: serializePayload(matcherData),
  }
  blocklistMatcherRevision$.set(matcherData.revision)
}

function toMatcherData(snapshot: PersistedBlocklistMatcherSnapshot): BlocklistMatcherData {
  return {
    enabled: true,
    blockedHosts: decodeHosts(snapshot.blockedHosts),
    allowedHosts: decodeHosts(snapshot.allowedHosts),
    cosmeticFilters: decodeHosts(snapshot.cosmeticFilters || ''),
    cosmeticExceptions: decodeHosts(snapshot.cosmeticExceptions || ''),
    revision: snapshot.revision,
  }
}

function toPersistedMatcherSnapshot(matcherData: BlocklistMatcherData): PersistedBlocklistMatcherSnapshot {
  return {
    revision: matcherData.revision,
    parserVersion: BLOCKLIST_PARSER_VERSION,
    blockedHosts: encodeHosts(matcherData.blockedHosts),
    allowedHosts: encodeHosts(matcherData.allowedHosts),
    cosmeticFilters: encodeHosts(matcherData.cosmeticFilters),
    cosmeticExceptions: encodeHosts(matcherData.cosmeticExceptions),
  }
}

async function mergeFilterListsInBackground(bodies: string[], revision: number): Promise<PersistedBlocklistMatcherSnapshot | null> {
  if (workletRuntime) {
    try {
      const timeoutError = new Error(`Timed out processing blocklist in worklet after ${Math.round(BLOCKLIST_WORKLET_TIMEOUT_MS / 1000)}s`)
      const result = await Promise.race([
        runOnRuntime(workletRuntime, mergeFilterListsText)(bodies),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(timeoutError), BLOCKLIST_WORKLET_TIMEOUT_MS)
        }),
      ])
      if (result && typeof result.blockedHosts === 'string' && typeof result.allowedHosts === 'string') {
        return {
          revision,
          parserVersion: BLOCKLIST_PARSER_VERSION,
          blockedHosts: result.blockedHosts,
          allowedHosts: result.allowedHosts,
          cosmeticFilters: typeof result.cosmeticFilters === 'string' ? result.cosmeticFilters : '',
          cosmeticExceptions: typeof result.cosmeticExceptions === 'string' ? result.cosmeticExceptions : '',
        }
      }
      console.warn('[blocklist] Invalid worklet merge result, falling back to async parser')
    } catch (error) {
      console.warn('[blocklist] Worklet merge failed, falling back to async parser', error)
    }
  }
  const merged = await mergeFilterListsAsync(bodies)
  return {
    revision,
    parserVersion: BLOCKLIST_PARSER_VERSION,
    blockedHosts: encodeHosts(merged.blockedHosts),
    allowedHosts: encodeHosts(merged.allowedHosts),
    cosmeticFilters: encodeHosts(merged.cosmeticFilters),
    cosmeticExceptions: encodeHosts(merged.cosmeticExceptions),
  }
}

async function readMergedPayloadFromFiles(revision: number): Promise<BlocklistMatcherData | null> {
  const bodies = await Promise.all(BLOCKLIST_SOURCE_IDS.map((id) => readBlocklistSourceFile(id)))
  if (bodies.some((body) => !body)) {
    return null
  }

  const snapshot = await mergeFilterListsInBackground(bodies.map((body) => body || ''), revision)
  if (!snapshot) {
    return null
  }
  const matcherData = toMatcherData(snapshot)

  if (!matcherData.blockedHosts.length && !matcherData.allowedHosts.length) {
    return null
  }

  return matcherData
}

function getCachedPayload(revision: number) {
  return payloadCache?.revision === revision ? payloadCache.payload : undefined
}

function parseCosmeticRule(rule: string) {
  const separator = rule.includes('#@#') ? '#@#' : '##'
  const separatorIndex = rule.indexOf(separator)
  if (separatorIndex === -1) {
    return null
  }
  return {
    domains: rule.slice(0, separatorIndex),
    selector: rule.slice(separatorIndex + separator.length),
  }
}

function cosmeticRuleMatchesHost(domains: string, host: string) {
  const normalizedHost = host.toLowerCase()
  const candidates = normalizedHost.split('.').map((_, index, parts) => parts.slice(index).join('.'))
  if (!domains) {
    return true
  }

  const entries = domains
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
  if (!entries.length) {
    return true
  }

  const isMatch = (entry: string) => candidates.includes(entry)
  if (entries.some((entry) => entry.startsWith('~') && isMatch(entry.slice(1)))) {
    return false
  }

  const positiveEntries = entries.filter((entry) => !entry.startsWith('~'))
  return !positiveEntries.length || positiveEntries.some(isMatch)
}

export function getCosmeticCssForHost(host?: string | null) {
  if (!host || !payloadCache?.matcherData.enabled) {
    return ''
  }

  if (isBlocklistExcludedHost(host, blocklist$.excludedHosts.get() || [])) {
    return ''
  }

  const matcherData = payloadCache.matcherData
  const exceptions = new Set(
    matcherData.cosmeticExceptions
      .map(parseCosmeticRule)
      .filter((rule): rule is NonNullable<ReturnType<typeof parseCosmeticRule>> => !!rule)
      .filter((rule) => cosmeticRuleMatchesHost(rule.domains, host))
      .map((rule) => rule.selector),
  )

  return matcherData.cosmeticFilters
    .map(parseCosmeticRule)
    .filter((rule): rule is NonNullable<ReturnType<typeof parseCosmeticRule>> => !!rule)
    .filter((rule) => cosmeticRuleMatchesHost(rule.domains, host))
    .filter((rule) => !exceptions.has(rule.selector))
    .map((rule) => `${rule.selector}{display:none!important;}`)
    .join('\n')
}

export async function loadCosmeticFilters() {
  await waitForBlocklistPersist()
  const state = blocklist$.get()
  if (!state.enabled || !state.hasSnapshot) {
    return false
  }

  return !!(await getPersistedMatcherData(state.revision))
}

async function getPersistedMatcherData(revision: number) {
  if (payloadCache?.revision === revision) {
    return payloadCache.matcherData
  }

  const persistedSnapshot = await readBlocklistMatcherSnapshot()
  if (
    persistedSnapshot?.revision === revision &&
    persistedSnapshot.parserVersion === BLOCKLIST_PARSER_VERSION &&
    typeof persistedSnapshot.cosmeticFilters === 'string'
  ) {
    const matcherData = toMatcherData(persistedSnapshot)
    setPayloadCache(matcherData)
    return matcherData
  }

  const matcherData = await readMergedPayloadFromFiles(revision)
  if (!matcherData) {
    return null
  }

  await writeBlocklistMatcherSnapshot(toPersistedMatcherSnapshot(matcherData))
  setPayloadCache(matcherData)
  return matcherData
}

export function supportsRuntimeBlocklist() {
  return !isWeb || hasElectron()
}

/**
 * The sites ad blocking is off for, under the condition the header's per-site
 * switch appears under: with no runtime blocklist there is no switch to flip,
 * and a leftover exception must not keep blocking off for a site the user can
 * no longer re-enable it on once the blocklist is disabled.
 */
function adBlockingExclusions() {
  if (!supportsRuntimeBlocklist() || !blocklist$.enabled.get()) {
    return []
  }
  return blocklist$.excludedHosts.get() || []
}

export function isAdBlockingDisabledForHost(host?: string | null) {
  return isBlocklistExcludedHost(host, adBlockingExclusions())
}

/**
 * A snippet handing the page its exceptions before the content script runs, so
 * the built-in blocking knows to stay out of the way from the first request.
 * Blocking is irreversible in the ways that matter -- an XHR response is
 * rewritten once, an element gets an inline `display: none` -- so waiting for
 * the app to push its settings after load would be too late.
 *
 * It carries the hosts rather than a resolved flag because the script is
 * installed before the view has navigated: only the page itself knows in time
 * which site it turned out to be.
 *
 * Desktop only. The native views build the same snippet themselves from the
 * exceptions `setBlocklistExcludedHosts` already hands them, so that flipping a
 * site's switch and reloading it go through one setter, in that order.
 */
export function buildAdBlockingExclusionsScript() {
  return `try{window.__noraBlocklistExcludedHosts=${JSON.stringify(adBlockingExclusions())}}catch(e){}`
}

export async function waitForBlocklistPersist() {
  await when(syncState(blocklist$).isPersistLoaded)
}

let lastAppliedRevision = -1
let lastAppliedEnabled: boolean | undefined
let lastAppliedPartitionsKey: string | undefined

export async function applyBlocklist() {
  if (!supportsRuntimeBlocklist()) {
    return
  }

  const state = blocklist$.get()
  const enabled = !!(state.enabled && state.hasSnapshot)
  // A new profile means a new Electron partition that has no request handler
  // yet, so the partition set is part of what "already applied" means.
  const partitions = hasElectron() ? getDesktopPartitions() : undefined
  const partitionsKey = partitions?.join(',')
  if (state.revision === lastAppliedRevision && enabled === lastAppliedEnabled && partitionsKey === lastAppliedPartitionsKey) {
    return
  }

  lastAppliedRevision = state.revision
  lastAppliedEnabled = enabled
  lastAppliedPartitionsKey = partitionsKey

  let activePayload = emptyPayload(state.revision)
  if (isIos) {
    if (enabled) {
      await getPersistedMatcherData(state.revision)
    }
    if (enabled && typeof NoraViewModule.reloadBlocklistFromDisk === 'function') {
      const reloaded = await NoraViewModule.reloadBlocklistFromDisk(enabled, state.revision)
      if (reloaded) {
        return
      }
    }
    if (typeof NoraViewModule.reloadBlocklistFromSourceFiles === 'function') {
      await NoraViewModule.reloadBlocklistFromSourceFiles(enabled, state.revision)
      return
    }
  }
  if (state.enabled && state.hasSnapshot) {
    const cachedPayload = getCachedPayload(state.revision)
    if (cachedPayload) {
      activePayload = cachedPayload
    } else {
      const matcherData = await getPersistedMatcherData(state.revision)
      if (matcherData) {
        activePayload = serializePayload(matcherData)
      }
    }
  }

  if (partitions) {
    const desktopPayload: DesktopBlocklistPayload = { ...activePayload, partitions }
    await window.electron.ipcRenderer.invoke(MAIN_CHANNEL, 'setBlocklist', desktopPayload)
    return
  }

  NoraViewModule.setBlocklist(activePayload)
}

let lastAppliedExclusionsKey: string | undefined
let pendingExclusions: Promise<void> = Promise.resolve()

async function applyBlocklistExclusionsNow() {
  if (!supportsRuntimeBlocklist()) {
    return
  }

  // Not the stored list but the effective one: a leftover exception must not keep
  // blocking off for a site whose switch is hidden because the whole blocklist is.
  const excludedHosts = [...adBlockingExclusions()].sort()
  const partitions = hasElectron() ? getDesktopPartitions() : undefined
  const key = `${partitions?.join(',') || ''}|${excludedHosts.join(',')}`
  if (key === lastAppliedExclusionsKey) {
    return
  }

  if (partitions) {
    const payload: BlocklistExclusionsPayload = { excludedHosts, partitions }
    await window.electron.ipcRenderer.invoke(MAIN_CHANNEL, 'setBlocklistExcludedHosts', payload)
  } else {
    // Awaited: it lands on the main thread, and the caller reloads the page
    // once it has, so the reload cannot outrun the exceptions.
    await NoraViewModule.setBlocklistExcludedHosts?.(encodeHosts(excludedHosts))
  }

  // Only once it landed: a failed IPC must not leave the filter blocking a site
  // the user turned blocking off for, with nothing to retry it.
  lastAppliedExclusionsKey = key
}

/**
 * Per-site exceptions are independent of the downloaded lists, so they travel on
 * their own instead of forcing a payload rebuild whenever the user flips one.
 *
 * Calls are chained rather than run in parallel: the returned promise resolves
 * once every application queued before it has finished, so a caller that
 * reloads the page afterwards cannot outrun an in-flight update -- on desktop
 * that is an IPC round trip to the main process.
 */
export function applyBlocklistExclusions() {
  pendingExclusions = pendingExclusions.catch(() => {}).then(applyBlocklistExclusionsNow)
  return pendingExclusions
}

async function fetchSource(id: BlocklistSourceId, now: number): Promise<BlocklistFetchSourceResult> {
  const source = blocklist$.sources[id].get()
  const headers: Record<string, string> = {}
  if (source.etag) {
    headers['If-None-Match'] = source.etag
  }
  if (source.lastModified) {
    headers['If-Modified-Since'] = source.lastModified
  }

  const response = await fetchRemoteText(source.url, headers)
  if (response.status === 304) {
    const existingBody = await readBlocklistSourceFile(id)
    if (!existingBody) {
      throw new Error(`Received 304 without cached blocklist data for ${id}`)
    }
    return {
      id,
      status: response.status,
      etag: source.etag,
      lastModified: source.lastModified,
      lastFetchedAt: now,
    }
  }

  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Failed to fetch ${id}: HTTP ${response.status}`)
  }

  return {
    id,
    status: response.status,
    body: response.body,
    etag: readHeader(response.headers, 'etag'),
    lastModified: readHeader(response.headers, 'last-modified'),
    lastFetchedAt: now,
  }
}

async function getSourceBodiesFromRefreshResults(settled: PromiseSettledResult<BlocklistFetchSourceResult>[]) {
  const bodies = await Promise.all(
    BLOCKLIST_SOURCE_IDS.map(async (id, index) => {
      const result = settled[index]
      if (result?.status !== 'fulfilled') {
        return null
      }
      if (typeof result.value.body === 'string') {
        return result.value.body
      }

      const existingBody = await readBlocklistSourceFile(id)
      return existingBody || null
    }),
  )

  if (bodies.some((body) => !body)) {
    return null
  }

  return bodies.map((body) => body || '')
}

let inFlightRefresh: Promise<boolean> | undefined

export async function refreshBlocklist({ manual = false } = {}) {
  // The preflight checks below await storage before `phase` becomes 'fetching',
  // so without this lock two callers (startup, interval, foreground, button)
  // can both get past them and fetch/write in parallel.
  while (inFlightRefresh) {
    const pending = inFlightRefresh
    if (!manual) {
      return pending
    }
    await pending.catch(() => false)
  }

  const refresh = runRefresh(manual).finally(() => {
    if (inFlightRefresh === refresh) {
      inFlightRefresh = undefined
    }
  })
  inFlightRefresh = refresh
  return refresh
}

async function runRefresh(manual: boolean) {
  await waitForBlocklistPersist()

  const current = blocklist$.get()
  const storedFilesReady = await hasBlocklistSourceFiles(BLOCKLIST_SOURCE_IDS)
  if (!manual && !shouldAutoRefresh(current)) {
    if (current.hasSnapshot && storedFilesReady) {
      return false
    }
  }
  if (current.phase === 'fetching') {
    return false
  }

  const previousSnapshot = current.hasSnapshot ? await readBlocklistMatcherSnapshot() : null

  blocklist$.assign({
    phase: 'fetching',
    lastError: undefined,
  })

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let refreshPromise: Promise<boolean> | undefined

  try {
    refreshPromise = (async () => {
      const now = Date.now()
      const settled = await Promise.allSettled(BLOCKLIST_SOURCE_IDS.map((id) => fetchSource(id, now)))
      const failure = settled.find((result) => result.status === 'rejected')
      if (failure) {
        throw failure.reason instanceof Error ? failure.reason : new Error(String(failure.reason))
      }

      const nextSources = BLOCKLIST_SOURCE_IDS.reduce(
        (acc, id, index) => {
          const result = settled[index]
          if (result.status === 'fulfilled') {
            const value = result.value
            acc[id] = {
              ...current.sources[id],
              etag: value.etag,
              lastModified: value.lastModified,
              lastFetchedAt: value.lastFetchedAt,
            }
          }
          return acc
        },
        {} as BlocklistSnapshot['sources'],
      )

      const writes = settled
        .filter((result): result is PromiseFulfilledResult<BlocklistFetchSourceResult> => result.status === 'fulfilled')
        .filter((result) => result.value.status !== 304 && typeof result.value.body === 'string')
        .map((result) => writeBlocklistSourceFile(result.value.id, result.value.body || ''))

      const sourceBodies = await getSourceBodiesFromRefreshResults(settled)
      if (!sourceBodies) {
        throw new Error('Blocklist source files are missing or invalid')
      }

      const payloadRevision = current.revision + 1

      if (isIos && typeof NoraViewModule.reloadBlocklistFromSourceFiles === 'function') {
        const nextSnapshot = await mergeFilterListsInBackground(sourceBodies, payloadRevision)
        if (!nextSnapshot || (!nextSnapshot.blockedHosts && !nextSnapshot.allowedHosts)) {
          throw new Error('Blocklist source files are missing or invalid')
        }

        await Promise.all([...writes, writeBlocklistMatcherSnapshot(nextSnapshot)])

        const reloaded = await NoraViewModule.reloadBlocklistFromSourceFiles(current.enabled, payloadRevision)
        if (!reloaded) {
          throw new Error('Blocklist source files are missing or invalid')
        }

        const snapshotChanged =
          nextSnapshot.blockedHosts !== (previousSnapshot?.blockedHosts || '') ||
          nextSnapshot.allowedHosts !== (previousSnapshot?.allowedHosts || '')
        const nextMatcherData = toMatcherData(nextSnapshot)
        setPayloadCache(nextMatcherData)

        lastAppliedRevision = snapshotChanged ? payloadRevision : current.revision
        lastAppliedEnabled = current.enabled

        blocklist$.assign({
          phase: 'ready',
          hasSnapshot: true,
          lastUpdatedAt: now,
          lastError: undefined,
          revision: snapshotChanged ? payloadRevision : current.revision,
          sources: nextSources,
        })

        if (!snapshotChanged && current.revision !== nextSnapshot.revision) {
          setPayloadCache({
            ...nextMatcherData,
            revision: current.revision,
          })
        }
        return true
      }

      const nextSnapshot = await mergeFilterListsInBackground(sourceBodies, payloadRevision)
      if (!nextSnapshot || (!nextSnapshot.blockedHosts && !nextSnapshot.allowedHosts)) {
        throw new Error('Blocklist source files are missing or invalid')
      }

      await Promise.all([...writes, writeBlocklistMatcherSnapshot(nextSnapshot)])

      const snapshotChanged =
        nextSnapshot.blockedHosts !== (previousSnapshot?.blockedHosts || '') ||
        nextSnapshot.allowedHosts !== (previousSnapshot?.allowedHosts || '')
      const nextMatcherData = toMatcherData(nextSnapshot)
      setPayloadCache(nextMatcherData)

      blocklist$.assign({
        phase: 'ready',
        hasSnapshot: true,
        lastUpdatedAt: now,
        lastError: undefined,
        revision: snapshotChanged ? payloadRevision : current.revision,
        sources: nextSources,
      })

      if (!snapshotChanged && current.revision !== nextSnapshot.revision) {
        setPayloadCache({
          ...nextMatcherData,
          revision: current.revision,
        })
      }
      return true
    })()

    const emergencyTimeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Update timed out after 60 seconds'))
      }, 60_000)
    })

    const result = await Promise.race([refreshPromise, emergencyTimeoutPromise])
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    return result
  } catch (error) {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    blocklist$.assign({
      phase: 'error',
      lastError: error instanceof Error ? error.message : String(error),
    })
    // Losing the race does not cancel the work, so wait for it to settle before
    // releasing the refresh lock; otherwise the next refresh would fetch, write
    // and assign state on top of a run that is still going. Every step it takes
    // is bounded by its own timeout, so this cannot wait indefinitely.
    await refreshPromise?.catch(() => false)
    return false
  }
}

export async function refreshBlocklistIfDue() {
  return refreshBlocklist({ manual: false })
}

export async function resetBlocklist() {
  await waitForBlocklistPersist()

  const current = blocklist$.get()
  if (current.phase === 'fetching') {
    return false
  }

  await deleteBlocklistSourceFiles(BLOCKLIST_SOURCE_IDS)
  await deleteBlocklistMatcherSnapshot()
  payloadCache = undefined

  const sources = BLOCKLIST_SOURCE_IDS.reduce(
    (acc, id) => {
      acc[id] = {
        url: current.sources[id].url,
      }
      return acc
    },
    {} as BlocklistSnapshot['sources'],
  )

  blocklist$.assign({
    phase: 'idle',
    hasSnapshot: false,
    lastUpdatedAt: undefined,
    lastError: undefined,
    revision: 0,
    sources,
  })

  return true
}
