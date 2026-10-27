import { watchSiteLabels, type WatchSite, type WatchTarget } from './types'

/** How the list of watched sources is ordered: by name, or by the newest post, when watched, or the last good check. */
export type WatchSourceSort = 'name' | 'updated' | 'added' | 'synced'

export const WATCH_SOURCE_SORTS: WatchSourceSort[] = ['name', 'updated', 'added', 'synced']

/**
 * The sources in the order asked for: A to Z by name, newest first by time, or the other way round when
 * reversed. A source with no such time yet, as one never checked, comes last either way.
 */
export function sortWatchSources<
  T extends WatchTarget & { name?: string; addedAt: number; lastSuccessAt?: number; key: string },
>(sources: T[], newestPostAt: Record<string, number | undefined>, sort: WatchSourceSort, reversed = false): T[] {
  const time = (source: T): number | undefined => {
    if (sort === 'added') return source.addedAt
    if (sort === 'synced') return source.lastSuccessAt
    return newestPostAt[source.key]
  }
  const label = (source: T) => source.name || source.handle
  const direction = reversed ? -1 : 1
  return [...sources].sort((a, b) => {
    if (sort === 'name') return direction * label(a).localeCompare(label(b), undefined, { sensitivity: 'base' })
    const ta = time(a)
    const tb = time(b)
    if (ta === undefined || tb === undefined) return ta === tb ? 0 : ta === undefined ? 1 : -1
    return direction * (tb - ta)
  })
}

/**
 * The sources a feed has chips for, so that a long list stays short: those with unread posts first,
 * then the latest to post, up to the limit; the one shown is kept even when it is past it.
 */
export function feedChipSources<T extends WatchTarget & { name?: string; addedAt: number; lastSuccessAt?: number; key: string }>(
  sources: T[],
  newestPostAt: Record<string, number | undefined>,
  unreadSourceKeys: Set<string>,
  limit: number,
  selectedKey?: string,
): { shown: T[]; hidden: number } {
  const hasUnread = (source: T) => unreadSourceKeys.has(source.key)
  const byPost = sortWatchSources(sources, newestPostAt, 'updated')
  const ordered = [...byPost.filter(hasUnread), ...byPost.filter((source) => !hasUnread(source))]
  if (ordered.length <= limit) return { shown: ordered, hidden: 0 }
  const shown = ordered.slice(0, limit)
  const selected = selectedKey ? ordered.slice(limit).find((source) => source.key === selectedKey) : undefined
  if (selected) shown.push(selected)
  return { shown, hidden: ordered.length - shown.length }
}

/** The sources whose name, handle or site has the words typed, all of them, and that are on the site chosen, if any. */
export function filterWatchSources<T extends WatchTarget & { name?: string }>(sources: T[], query: string, site?: WatchSite): T[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return sources.filter((source) => {
    if (site && source.site !== site) return false
    const text = [source.name || '', source.handle, watchSiteLabels[source.site]].join(' ').toLowerCase()
    return words.every((word) => text.includes(word.replace(/^@/, '')))
  })
}

/** Some of the watched profiles, which a feed tab can show on their own; a profile is in one at most. */
export interface WatchTimeline {
  id: string
  name: string
  // Minutes between checks of its profiles that have no choice of their own; the default for all when not set.
  checkIntervalMinutes?: number
  // Shown on the new tab page, next to the whole feed.
  pinned?: boolean
  // Only the posts with photos or videos, shown as a grid.
  mediaOnly?: boolean
  // Its icon on the new tab page; DEFAULT_TIMELINE_EMOJI when not set.
  emoji?: string
}

export const DEFAULT_TIMELINE_EMOJI = '🧵'

/** What a person typed as an emoji, or nothing when it was left empty. */
export const cleanEmoji = (value: unknown) => (typeof value === 'string' ? value.trim().slice(0, 16) : '') || undefined
