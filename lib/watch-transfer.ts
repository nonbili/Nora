/**
 * Watched sources out of Nora and back: as a section of the settings backup, and from a list of
 * links someone else made, an OPML file of an RSS reader or plain links one per line.
 */

import { batch } from '@legendapp/state'
import { watch$, type WatchedProfile } from '@/states/watch'
import { cleanEmoji, decodeEntities, getWatchTarget, watchKey, watchProfileUrl, watchSiteLabels, type WatchSite, type WatchTarget } from './watch'

/** A watched source as it travels: what was chosen for it, not what was last read from the site. */
export interface WatchSourceBackup extends WatchTarget {
  url?: string
  name?: string
  notify?: boolean
  checkIntervalMinutes?: number
}

export interface WatchTimelineBackup {
  name: string
  profileKeys: string[]
  pinned?: boolean
  mediaOnly?: boolean
  emoji?: string
  // Only there when it notifies of new posts.
  notify?: true
}

export interface WatchBackup {
  checkIntervalMinutes?: number
  mediaWifiOnly?: boolean
  mediaLimitMB?: number
  postsPerSource?: number
  // Only there when the whole feed is not pinned to the new tab page.
  feedPinned?: false
  feedEmoji?: string
  // Only there when the whole feed notifies of new posts.
  feedNotify?: true
  profiles: WatchSourceBackup[]
  timelines: WatchTimelineBackup[]
}

export interface SourceListImport extends WatchBackup {
  // Links in the list that are not of a source Nora can watch.
  unrecognized: number
}

export interface WatchImportResult {
  added: number
  existing: number
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const positiveNumber = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : undefined)

/** The posts, the media and how the last check went stay behind: they are of this device. */
export const createWatchBackup = (): WatchBackup => ({
  checkIntervalMinutes: watch$.checkIntervalMinutes.get(),
  mediaWifiOnly: watch$.mediaWifiOnly.get(),
  mediaLimitMB: watch$.mediaLimitMB.get(),
  postsPerSource: watch$.postsPerSource.get(),
  ...(watch$.feedPinned.get() ? {} : { feedPinned: false as const }),
  ...(watch$.feedEmoji.get() ? { feedEmoji: watch$.feedEmoji.get() } : {}),
  ...(watch$.feedNotify.get() ? { feedNotify: true as const } : {}),
  profiles: watch$.profiles.get().map((profile) => ({
    site: profile.site,
    handle: profile.handle,
    ...(profile.url ? { url: profile.url } : {}),
    ...(profile.name ? { name: profile.name } : {}),
    notify: profile.notify,
    ...(profile.checkIntervalMinutes ? { checkIntervalMinutes: profile.checkIntervalMinutes } : {}),
  })),
  timelines: watch$.timelines.get().map((timeline) => ({
    name: timeline.name,
    profileKeys: [...timeline.profileKeys],
    ...(timeline.pinned ? { pinned: true } : {}),
    ...(timeline.mediaOnly ? { mediaOnly: true } : {}),
    ...(timeline.emoji ? { emoji: timeline.emoji } : {}),
    ...(watch$.notifyTimelineIds.get().includes(timeline.id) ? { notify: true as const } : {}),
  })),
})

/** A source of a backup, when it is one Nora could have watched: its page has to read back as the same source. */
export const validTarget = (site: unknown, handle: unknown): WatchTarget | null => {
  const cleanHandle = text(handle)
  if (typeof site !== 'string' || !Object.hasOwn(watchSiteLabels, site) || !cleanHandle) return null
  const target = { site: site as WatchSite, handle: cleanHandle }
  const parsed = getWatchTarget(watchProfileUrl(target))
  return parsed && watchKey(parsed) === watchKey(target) ? target : null
}

const timelineName = (name: string) => name.trim().toLowerCase()

/** The watch section of a settings backup, cleaned up; undefined when there is none. */
export const normalizeWatchBackup = (value: unknown): WatchBackup | undefined => {
  if (!isObject(value)) return undefined

  const profiles = new Map<string, WatchSourceBackup>()
  for (const item of Array.isArray(value.profiles) ? value.profiles : []) {
    if (!isObject(item)) continue
    const target = validTarget(item.site, item.handle)
    if (!target || profiles.has(watchKey(target))) continue
    const url = text(item.url)
    const name = text(item.name)
    const checkIntervalMinutes = positiveNumber(item.checkIntervalMinutes)
    profiles.set(watchKey(target), {
      ...target,
      ...(url && /^https?:\/\//i.test(url) ? { url } : {}),
      ...(name ? { name } : {}),
      notify: item.notify === true,
      ...(checkIntervalMinutes ? { checkIntervalMinutes } : {}),
    })
  }

  const timelines = new Map<string, WatchTimelineBackup>()
  for (const item of Array.isArray(value.timelines) ? value.timelines : []) {
    if (!isObject(item)) continue
    const name = text(item.name)
    if (!name) continue
    const keys = (Array.isArray(item.profileKeys) ? item.profileKeys : []).filter(
      (key): key is string => typeof key === 'string' && profiles.has(key),
    )
    const pinned = item.pinned === true
    const mediaOnly = item.mediaOnly === true
    const emoji = cleanEmoji(item.emoji)
    const notify = item.notify === true
    const existing = timelines.get(timelineName(name))
    if (existing) {
      existing.profileKeys = Array.from(new Set([...existing.profileKeys, ...keys]))
      if (pinned) existing.pinned = true
      if (mediaOnly) existing.mediaOnly = true
      if (emoji && !existing.emoji) existing.emoji = emoji
      if (notify) existing.notify = true
    } else {
      timelines.set(timelineName(name), {
        name,
        profileKeys: Array.from(new Set(keys)),
        ...(pinned ? { pinned } : {}),
        ...(mediaOnly ? { mediaOnly } : {}),
        ...(emoji ? { emoji } : {}),
        ...(notify ? { notify } : {}),
      })
    }
  }

  const checkIntervalMinutes = positiveNumber(value.checkIntervalMinutes)
  const mediaLimitMB = positiveNumber(value.mediaLimitMB)
  const postsPerSource = positiveNumber(value.postsPerSource)
  return {
    ...(checkIntervalMinutes ? { checkIntervalMinutes } : {}),
    ...(typeof value.mediaWifiOnly === 'boolean' ? { mediaWifiOnly: value.mediaWifiOnly } : {}),
    ...(mediaLimitMB ? { mediaLimitMB } : {}),
    ...(postsPerSource ? { postsPerSource: Math.round(postsPerSource) } : {}),
    ...(value.feedPinned === false ? { feedPinned: false as const } : {}),
    ...(cleanEmoji(value.feedEmoji) ? { feedEmoji: cleanEmoji(value.feedEmoji) } : {}),
    ...(value.feedNotify === true ? { feedNotify: true as const } : {}),
    profiles: [...profiles.values()],
    timelines: [...timelines.values()],
  }
}

/**
 * Adds the sources that are not watched yet, and puts them in their timelines, made when there is
 * none of that name. Nothing already watched is taken away; the choices the backup has for a source
 * are taken over, except notifications, which are turned on with watchNotifyKeys and watchNotifyTimelineIds.
 */
export const applyWatchBackup = (backup: WatchBackup): WatchImportResult => {
  let added = 0
  let existing = 0
  batch(() => {
    if (backup.checkIntervalMinutes) watch$.checkIntervalMinutes.set(backup.checkIntervalMinutes)
    if (typeof backup.mediaWifiOnly === 'boolean') watch$.mediaWifiOnly.set(backup.mediaWifiOnly)
    if (backup.mediaLimitMB) watch$.mediaLimitMB.set(backup.mediaLimitMB)
    if (backup.postsPerSource) watch$.postsPerSource.set(backup.postsPerSource)
    if (backup.feedPinned === false) watch$.feedPinned.set(false)
    // What was chosen here stays.
    if (backup.feedEmoji && !watch$.feedEmoji.peek()) watch$.feedEmoji.set(backup.feedEmoji)

    const current = new Map(watch$.profiles.peek().map((profile) => [profile.key, profile]))
    for (const source of backup.profiles) {
      const key = watchKey(source)
      const profile = current.get(key)
      if (profile) {
        existing++
      } else {
        watch$.watch({ site: source.site, handle: source.handle })
        added++
      }
      const patch: Partial<WatchedProfile> = {}
      if (source.url && !profile?.url) patch.url = source.url
      if (source.name && !profile?.name) patch.name = source.name
      // Turned on only through enableWatchNotifications, which asks the system for permission first.
      if (source.notify === false) patch.notify = false
      if (source.checkIntervalMinutes) patch.checkIntervalMinutes = source.checkIntervalMinutes
      if (Object.keys(patch).length) watch$.updateProfile(key, patch)
    }

    const watched = new Set(watch$.profiles.peek().map((profile) => profile.key))
    for (const timeline of backup.timelines) {
      const keys = timeline.profileKeys.filter((key) => watched.has(key))
      const same = watch$.timelines.peek().find((t) => timelineName(t.name) === timelineName(timeline.name))
      if (same) {
        const merged = Array.from(new Set([...same.profileKeys, ...keys]))
        if (merged.length !== same.profileKeys.length) watch$.updateTimeline(same.id, { profileKeys: merged })
        if (timeline.pinned && !same.pinned) watch$.updateTimeline(same.id, { pinned: true })
        if (timeline.emoji && !same.emoji) watch$.updateTimeline(same.id, { emoji: timeline.emoji })
      } else {
        const id = watch$.createTimeline(timeline.name, keys)
        if (timeline.pinned) watch$.updateTimeline(id, { pinned: true })
        // How a timeline already here is shown stays as it was chosen here.
        if (timeline.mediaOnly) watch$.updateTimeline(id, { mediaOnly: true })
        if (timeline.emoji) watch$.updateTimeline(id, { emoji: timeline.emoji })
      }
    }
  })
  return { added, existing }
}

/** The sources of a backup that notify, to turn on once permission is given on this device. */
export const watchNotifyKeys = (backup: WatchBackup) =>
  backup.profiles.filter((source) => source.notify).map(watchKey)

/**
 * The timelines of a backup that notify, by the id of the one here of the same name, once the backup
 * is applied; undefined for the whole feed. To turn on once permission is given on this device.
 */
export const watchNotifyTimelineIds = (backup: WatchBackup): (string | undefined)[] => [
  ...(backup.feedNotify ? [undefined] : []),
  ...backup.timelines
    .filter((timeline) => timeline.notify)
    .map((timeline) => watch$.timelines.peek().find((t) => timelineName(t.name) === timelineName(timeline.name))?.id)
    .filter((id): id is string => Boolean(id)),
]

// The feeds the sites have for a source: /r/name/.rss, /@user.rss, /profile/handle/rss.
const FEED_SUFFIX = /(?:\/\.?|\.)(?:rss|atom)$/i

/** The source a link is of: its page, or the RSS feed its site has for it. */
export const sourceFromUrl = (value: string): WatchTarget | null => {
  const link = value.trim()
  if (!link) return null
  const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(link) ? link : `https://${link}`
  const target = getWatchTarget(url)
  if (target) return target
  try {
    const parsed = new URL(url)
    if (!FEED_SUFFIX.test(parsed.pathname)) return null
    // Mastodon also has /users/name.atom, of the profile /@name.
    parsed.pathname = parsed.pathname.replace(FEED_SUFFIX, '').replace(/^\/users\/([^/]+)$/, '/@$1')
    parsed.search = ''
    return getWatchTarget(parsed.toString())
  } catch {
    return null
  }
}

interface ListedSource {
  target: WatchTarget
  folder?: string
}

const OUTLINE_TAG = /<(\/?)outline\b((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>/gi
const ATTRIBUTE = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

const attributesOf = (source: string) => {
  const attributes: Record<string, string> = {}
  for (const match of source.matchAll(ATTRIBUTE)) {
    attributes[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? '')
  }
  return attributes
}

/** The sources of an OPML file, each in the folder it is in: a folder is an outline with no link. */
const parseOpml = (opml: string) => {
  const sources: ListedSource[] = []
  let unrecognized = 0
  // The name of each open outline that is a folder; undefined for one that is a source.
  const open: (string | undefined)[] = []
  for (const [, closing, attributeSource, selfClosing] of opml.matchAll(OUTLINE_TAG)) {
    if (closing) {
      open.pop()
      continue
    }
    const attributes = attributesOf(attributeSource)
    const links = [attributes.htmlurl, attributes.xmlurl, attributes.url].filter(Boolean)
    if (links.length) {
      const target = links.map(sourceFromUrl).find(Boolean)
      if (target) {
        sources.push({ target, folder: open.findLast(Boolean) })
      } else {
        unrecognized++
      }
    }
    if (!selfClosing) {
      open.push(links.length ? undefined : text(attributes.title) || text(attributes.text))
    }
  }
  return { sources, unrecognized }
}

/** The sources of plain text: links one per line, or apart by spaces or commas; a line starting with # is not read. */
const parseLinks = (list: string) => {
  const sources: ListedSource[] = []
  let unrecognized = 0
  for (const line of list.split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue
    for (const link of line.split(/[\s,]+/).filter(Boolean)) {
      const target = sourceFromUrl(link)
      if (target) {
        sources.push({ target })
      } else {
        unrecognized++
      }
    }
  }
  return { sources, unrecognized }
}

/** The sources of an OPML file or of a list of links, with the OPML folders as timelines. */
export const parseSourceList = (list: string): SourceListImport => {
  const { sources, unrecognized } = /<outline\b/i.test(list) ? parseOpml(list) : parseLinks(list)
  const profiles = new Map<string, WatchSourceBackup>()
  const timelines = new Map<string, WatchTimelineBackup>()
  for (const { target, folder } of sources) {
    const key = watchKey(target)
    if (!profiles.has(key)) profiles.set(key, target)
    if (!folder) continue
    const timeline = timelines.get(timelineName(folder)) || { name: folder, profileKeys: [] }
    if (!timeline.profileKeys.includes(key)) timeline.profileKeys.push(key)
    timelines.set(timelineName(folder), timeline)
  }
  return { profiles: [...profiles.values()], timelines: [...timelines.values()], unrecognized }
}
