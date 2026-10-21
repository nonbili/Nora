/**
 * The feed's sources and timelines as rows synced one by one, so what two devices change at once
 * both stays. Notifications, of a source or a timeline, posts and how the checks went are of each
 * device and stay on it.
 */

import { batch } from '@legendapp/state'
import { deleteProfilePosts } from '@/lib/watch-db'
import { watch$, type WatchedProfile } from '@/states/watch'
import { validTarget } from './watch-transfer'
import { cleanEmoji, watchKey, type WatchTarget, type WatchTimeline } from './watch'

export interface WatchSourceRow extends WatchTarget {
  addedAt: number
  checkIntervalMinutes?: number
}

export interface WatchTimelineRow {
  name: string
  profileKeys: string[]
  pinned?: boolean
  mediaOnly?: boolean
  emoji?: string
}

/** Sources by their key, timelines by their id. */
export interface WatchSyncRows {
  sources: Record<string, WatchSourceRow>
  timelines: Record<string, WatchTimelineRow>
}

/** A row as the server keeps it: one taken away has deleted_at, so the other devices take it away too. */
export interface RemoteWatchRow {
  id: string
  json: Record<string, unknown> | null
  updated_at: string
}

export interface PendingWatchRows {
  sources: ReadonlySet<string>
  timelines: ReadonlySet<string>
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const positiveNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined

/** The row of the whole feed among the timelines: there only once it is unpinned or has an emoji of its own. */
export const FEED_ROW_ID = '_feed'

export const getWatchSyncRows = (
  value: { profiles: WatchedProfile[]; timelines: WatchTimeline[]; feedPinned: boolean; feedEmoji: string } = watch$.peek(),
): WatchSyncRows => ({
  sources: Object.fromEntries(
    value.profiles.map((profile) => [
      profile.key,
      {
        site: profile.site,
        handle: profile.handle,
        addedAt: profile.addedAt,
        ...(profile.checkIntervalMinutes ? { checkIntervalMinutes: profile.checkIntervalMinutes } : {}),
      },
    ]),
  ),
  timelines: Object.fromEntries([
    ...(value.feedPinned && !value.feedEmoji
      ? []
      : [[FEED_ROW_ID, { name: '', profileKeys: [], pinned: value.feedPinned, ...(value.feedEmoji ? { emoji: value.feedEmoji } : {}) }] as const]),
    ...value.timelines.map((timeline) => [
      timeline.id,
      {
        name: timeline.name,
        profileKeys: [...timeline.profileKeys],
        ...(timeline.pinned ? { pinned: true } : {}),
        ...(timeline.mediaOnly ? { mediaOnly: true } : {}),
        ...(timeline.emoji ? { emoji: timeline.emoji } : {}),
      },
    ]),
  ]),
})

/** The ids of rows added, changed or taken away. */
export const changedRowIds = (next: Record<string, unknown>, prev: Record<string, unknown>) => {
  const ids = new Set<string>()
  for (const id of Object.keys(next)) {
    if (JSON.stringify(next[id]) !== JSON.stringify(prev[id])) ids.add(id)
  }
  for (const id of Object.keys(prev)) {
    if (!(id in next)) ids.add(id)
  }
  return [...ids]
}

export const isDeletedRow = (row: RemoteWatchRow) => Boolean(row.json?.deleted_at)

export const parseSourceRow = (row: RemoteWatchRow): WatchSourceRow | null => {
  const json = row.json
  if (!isObject(json)) return null
  const target = validTarget(json.site, json.handle)
  if (!target || watchKey(target) !== row.id) return null
  const checkIntervalMinutes = positiveNumber(json.checkIntervalMinutes)
  return {
    ...target,
    addedAt: positiveNumber(json.addedAt) ?? Date.parse(row.updated_at),
    ...(checkIntervalMinutes ? { checkIntervalMinutes } : {}),
  }
}

export const parseTimelineRow = (row: RemoteWatchRow): WatchTimelineRow | null => {
  const json = row.json
  if (!isObject(json) || typeof json.name !== 'string' || !json.name.trim()) return null
  const keys = (Array.isArray(json.profileKeys) ? json.profileKeys : []).filter((key): key is string => typeof key === 'string')
  return {
    name: json.name.trim(),
    profileKeys: Array.from(new Set(keys)),
    ...(json.pinned === true ? { pinned: true } : {}),
    ...(json.mediaOnly === true ? { mediaOnly: true } : {}),
    ...(cleanEmoji(json.emoji) ? { emoji: cleanEmoji(json.emoji) } : {}),
  }
}

/**
 * Takes in what other devices changed, except the rows changed here that are not pushed yet. What
 * this device knows of a source that stays is kept; a source taken away goes with its posts.
 */
export const applyRemoteWatchRows = (sources: RemoteWatchRow[], timelines: RemoteWatchRow[], pending: PendingWatchRows) => {
  // Each list is made here and set once, whole.
  const profiles = [...watch$.profiles.peek()]
  const removed: string[] = []
  for (const row of sources) {
    if (pending.sources.has(row.id)) continue
    const index = profiles.findIndex((profile) => profile.key === row.id)
    if (isDeletedRow(row)) {
      if (index !== -1) {
        profiles.splice(index, 1)
        removed.push(row.id)
      }
      continue
    }
    const source = parseSourceRow(row)
    if (!source) continue
    const patch = {
      site: source.site,
      handle: source.handle,
      addedAt: source.addedAt,
      checkIntervalMinutes: source.checkIntervalMinutes,
    }
    if (index === -1) {
      profiles.push({ key: row.id, notify: false, ...patch })
    } else {
      profiles[index] = { ...profiles[index], ...patch }
    }
  }

  const nextTimelines = [...watch$.timelines.peek()]
  let feedPinned = watch$.feedPinned.peek()
  let feedEmoji = watch$.feedEmoji.peek()
  for (const row of timelines) {
    if (pending.timelines.has(row.id)) continue
    if (row.id === FEED_ROW_ID) {
      // A row taken away is the feed as it starts: pinned, and with the default emoji.
      feedPinned = isDeletedRow(row) || row.json?.pinned !== false
      feedEmoji = (!isDeletedRow(row) && cleanEmoji(row.json?.emoji)) || ''
      continue
    }
    const index = nextTimelines.findIndex((timeline) => timeline.id === row.id)
    if (isDeletedRow(row)) {
      if (index !== -1) nextTimelines.splice(index, 1)
      continue
    }
    const timeline = parseTimelineRow(row)
    if (!timeline) continue
    if (index === -1) {
      nextTimelines.push({ id: row.id, ...timeline })
    } else {
      nextTimelines[index] = { id: row.id, ...timeline }
    }
  }

  batch(() => {
    watch$.profiles.set(profiles)
    watch$.timelines.set(nextTimelines)
    watch$.feedPinned.set(feedPinned)
    watch$.feedEmoji.set(feedEmoji)
  })
  for (const key of removed) deleteProfilePosts(key)
}

/**
 * A timeline made here before it was synced, of the same name as one already synced, is put into
 * that one, so the timelines made on two devices before the first sync are not each there twice.
 * Returns the id of the synced timeline each was put into.
 */
export const foldUnsyncedTimelines = (unsyncedIds: string[], remoteTimelines: RemoteWatchRow[]) => {
  const byName = new Map<string, string>()
  for (const row of remoteTimelines) {
    const timeline = isDeletedRow(row) ? null : parseTimelineRow(row)
    if (timeline) byName.set(timeline.name.toLowerCase(), row.id)
  }
  let timelines = [...watch$.timelines.peek()]
  const folded = new Map<string, string>()
  for (const id of unsyncedIds) {
    const local = timelines.find((timeline) => timeline.id === id)
    const intoId = local && byName.get(local.name.toLowerCase())
    if (!local || !intoId || !timelines.some((timeline) => timeline.id === intoId)) continue
    timelines = timelines
      .filter((timeline) => timeline.id !== id)
      .map((timeline) =>
        timeline.id === intoId
          ? {
              ...timeline,
              profileKeys: Array.from(new Set([...timeline.profileKeys, ...local.profileKeys])),
              ...(local.pinned ? { pinned: true } : {}),
              ...(local.mediaOnly ? { mediaOnly: true } : {}),
              // What was chosen there stays.
              ...(local.emoji && !timeline.emoji ? { emoji: local.emoji } : {}),
            }
          : timeline,
      )
    folded.set(id, intoId)
  }
  if (folded.size) {
    watch$.timelines.set(timelines)
    // One that notified here goes on notifying as the synced one.
    const notifyIds = watch$.notifyTimelineIds.peek()
    watch$.notifyTimelineIds.set(Array.from(new Set(notifyIds.map((id) => folded.get(id) ?? id))))
  }
  return folded
}
