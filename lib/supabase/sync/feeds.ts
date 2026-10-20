import { syncState, when } from '@legendapp/state'
import { createLogger } from '@/lib/log'
import { syncMeta$, type FeedSyncMeta } from '@/states/sync-meta'
import { watch$ } from '@/states/watch'
import { tabs$ } from '@/states/tabs'
import { feedTabUrl, getFeedTimelineId, isFeedTabUrl } from '@/lib/feed-tab'
import {
  applyRemoteWatchRows,
  changedRowIds,
  foldUnsyncedTimelines,
  getWatchSyncRows,
  type RemoteWatchRow,
  type WatchSyncRows,
} from '@/lib/watch-sync'
import { supabase } from '../client'
import { beginSync, canSync, isCurrentSession, type SyncSession } from './session'

export type FeedTable = 'feed_sources' | 'feed_timelines'

const syncDelayMs = 5 * 1000
// PostgREST answers with at most 1000 rows, so reads and writes go a page at a time.
const pageSize = 500
// A row written while a pull read past it can land just before the cursor; going back this far
// picks it up on the next pull, and the full pull each day makes sure of what this misses.
const cursorOverlapMs = 30 * 1000
const fullPullIntervalMs = 24 * 60 * 60 * 1000

const traceLogger = createLogger('sync', { devOnly: true }).child('feeds')
const errorLogger = createLogger('sync').child('feeds')

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

const quote = (value: string) => `"${value.replace(/"/g, '')}"`

/** Every row changed after the cursor, every row without one, ordered so a row written meanwhile is not skipped. */
export const fetchRows = async (table: FeedTable, cursor?: string) => {
  const rows: RemoteWatchRow[] = []
  for (;;) {
    let query = supabase
      .from(table)
      .select('id,json,updated_at')
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(pageSize)
    const last = rows.at(-1)
    if (last) {
      const at = quote(last.updated_at)
      query = query.or(`updated_at.gt.${at},and(updated_at.eq.${at},id.gt.${quote(last.id)})`)
    } else if (cursor) {
      query = query.gt('updated_at', cursor)
    }
    const { data, error } = await query
    if (error) throw error
    const page = (data || []) as unknown as RemoteWatchRow[]
    rows.push(...page)
    if (page.length < pageSize) return rows
  }
}

const nextCursor = (rows: RemoteWatchRow[], previous?: string) => {
  const max = rows.reduce((value, row) => Math.max(value, Date.parse(row.updated_at) || 0), 0)
  if (!max) return previous
  return new Date(Math.max(max - cursorOverlapMs, previous ? Date.parse(previous) : 0)).toISOString()
}

/** Feed tabs showing a timeline put into another show that one, not the whole feed. */
const moveFeedTabs = (folded: Map<string, string>) => {
  const move = <T extends { url: string }>(tabs: T[]) => {
    let moved = false
    const next = tabs.map((tab) => {
      const intoId = isFeedTabUrl(tab.url) ? folded.get(getFeedTimelineId(tab.url) ?? '') : undefined
      if (!intoId) return tab
      moved = true
      return { ...tab, url: feedTabUrl(intoId) }
    })
    return moved ? next : undefined
  }
  const tabs = move(tabs$.tabs.peek())
  if (tabs) tabs$.tabs.set(tabs)
  const closed = move(tabs$.recentlyClosedTabs.peek())
  if (closed) tabs$.recentlyClosedTabs.set(closed)
}

const pendingKey = { feed_sources: 'pendingSources', feed_timelines: 'pendingTimelines' } as const

const localRow = (table: FeedTable, rows: WatchSyncRows, id: string) =>
  table === 'feed_sources' ? rows.sources[id] : rows.timelines[id]

class FeedsSyncer {
  private applyingRemote = false
  private inFlight: Promise<void> | null = null
  private rerunRequested = false
  private timer: ReturnType<typeof setTimeout> | undefined

  // The rows as they were last seen, to tell what changed: the store is loaded from the device already.
  private lastRows: WatchSyncRows = getWatchSyncRows()

  isApplyingRemote() {
    return this.applyingRemote
  }

  /** Changes the feed with what was pulled, without taking it for a change made here. */
  applyRemote(apply: () => void) {
    this.applyingRemote = true
    try {
      apply()
    } finally {
      this.applyingRemote = false
      this.lastRows = getWatchSyncRows()
    }
  }

  /** Queues the rows changed here since last seen to be pushed; true when there was any. */
  trackLocalChange() {
    const next = getWatchSyncRows()
    const sources = changedRowIds(next.sources, this.lastRows.sources)
    const timelines = changedRowIds(next.timelines, this.lastRows.timelines)
    this.lastRows = next
    this.addPending('pendingSources', sources)
    this.addPending('pendingTimelines', timelines)
    return sources.length > 0 || timelines.length > 0
  }

  scheduleSync() {
    if (!canSync()) return
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.syncNow().catch((error) => errorLogger.error('sync failed', error))
    }, syncDelayMs)
  }

  async syncNow() {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    if (!canSync()) return
    if (this.inFlight) {
      this.rerunRequested = true
      return this.inFlight
    }
    const run = this.runLoop().finally(() => {
      if (this.inFlight === run) this.inFlight = null
    })
    this.inFlight = run
    return run
  }

  private addPending(key: 'pendingSources' | 'pendingTimelines', ids: string[]) {
    if (!ids.length) return
    const pending = syncMeta$.feeds[key]
    pending.set(Array.from(new Set([...pending.peek(), ...ids])))
  }

  private setMeta(meta: Partial<FeedSyncMeta>) {
    syncMeta$.feeds.assign(meta)
  }

  private async runLoop() {
    do {
      this.rerunRequested = false
      let session: SyncSession | null = null
      try {
        await when(() => syncState(watch$).isPersistLoaded.get())
        session = await beginSync()
        if (session) await this.performSync(session)
      } catch (error) {
        if (!session || isCurrentSession(session)) this.setMeta({ lastError: getErrorMessage(error) })
        throw error
      }
    } while (this.rerunRequested)
  }

  private async performSync(session: SyncSession) {
    const { userId } = session
    const isCurrent = () => isCurrentSession(session)

    const meta = syncMeta$.feeds.peek()
    const sameAccount = meta.userId === userId
    // A table without a cursor yet, having had no rows to pull, is read whole on any pull.
    const isFullPull = !sameAccount || Date.now() - (meta.lastFullPullAt || 0) >= fullPullIntervalMs
    const [sources, timelines] = await Promise.all([
      fetchRows('feed_sources', isFullPull ? undefined : meta.sourcesCursor),
      fetchRows('feed_timelines', isFullPull ? undefined : meta.timelinesCursor),
    ])
    if (!isCurrent()) return

    // Read now, not before the pull: what was changed here meanwhile is kept over what was pulled.
    const pending = {
      sources: new Set(syncMeta$.feeds.pendingSources.peek()),
      timelines: new Set(syncMeta$.feeds.pendingTimelines.peek()),
    }
    this.applyingRemote = true
    try {
      applyRemoteWatchRows(sources, timelines, pending)
      if (isFullPull) {
        // What the server does not have was never pushed: on the first sync of this device or account,
        // or when a push was lost. Pushed now, with what was made here put together with what was synced.
        const local = getWatchSyncRows()
        const remoteSources = new Set(sources.map((row) => row.id))
        const remoteTimelines = new Set(timelines.map((row) => row.id))
        const unsyncedTimelines = Object.keys(local.timelines).filter((id) => !remoteTimelines.has(id))
        const folded = foldUnsyncedTimelines(unsyncedTimelines, timelines)
        if (folded.size) moveFeedTabs(folded)
        const rows = getWatchSyncRows()
        // A timeline put into a synced one, or made and taken away here, was never on the server.
        syncMeta$.feeds.pendingTimelines.set(
          syncMeta$.feeds.pendingTimelines.peek().filter((id) => id in rows.timelines || remoteTimelines.has(id)),
        )
        this.addPending('pendingSources', Object.keys(rows.sources).filter((id) => !remoteSources.has(id)))
        this.addPending('pendingTimelines', [...folded.values(), ...Object.keys(rows.timelines).filter((id) => !remoteTimelines.has(id))])
      }
    } finally {
      this.applyingRemote = false
      this.lastRows = getWatchSyncRows()
    }

    // Sources first, so a timeline never reaches another device before the sources it shows.
    if (!(await this.push('feed_sources', userId, isCurrent))) return
    if (!(await this.push('feed_timelines', userId, isCurrent))) return

    // Only pulled rows move the cursors: a pushed row's time could step past another device's write.
    this.setMeta({
      userId,
      sourcesCursor: nextCursor(sources, sameAccount ? meta.sourcesCursor : undefined),
      timelinesCursor: nextCursor(timelines, sameAccount ? meta.timelinesCursor : undefined),
      ...(isFullPull ? { lastFullPullAt: Date.now() } : {}),
      lastSuccessfulSyncAt: Date.now(),
      lastError: undefined,
    })
    traceLogger.log('synced', { full: isFullPull, pulledSources: sources.length, pulledTimelines: timelines.length })
  }

  /** Pushes the rows changed here; false when the account changed meanwhile. */
  private async push(table: FeedTable, userId: string, isCurrent: () => boolean) {
    const key = pendingKey[table]
    const ids = syncMeta$.feeds[key].peek()
    if (!ids.length) return true

    const local = getWatchSyncRows()
    const deletedAt = new Date().toISOString()
    const sent = new Map(ids.map((id) => [id, JSON.stringify(localRow(table, local, id) ?? null)]))
    const rows = ids.map((id) => ({ user_id: userId, id, json: localRow(table, local, id) ?? { deleted_at: deletedAt } }))
    for (let index = 0; index < rows.length; index += pageSize) {
      const { error } = await supabase.from(table).upsert(rows.slice(index, index + pageSize), { onConflict: 'user_id,id' })
      if (error) throw error
      if (!isCurrent()) return false
    }

    // A row changed again while it was pushed stays to be pushed again.
    const now = getWatchSyncRows()
    syncMeta$.feeds[key].set(
      syncMeta$.feeds[key].peek().filter((id) => sent.get(id) !== JSON.stringify(localRow(table, now, id) ?? null)),
    )
    traceLogger.log('pushed', { table, count: rows.length })
    return true
  }
}

export const feedsSyncer = new FeedsSyncer()
