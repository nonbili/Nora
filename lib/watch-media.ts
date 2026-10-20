import { Platform } from 'react-native'
import { observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { Directory, File, Paths } from 'expo-file-system'
import NoraViewModule from '@/modules/nora-view'
import { SharedRequests } from '@/lib/shared-request'
import { watch$ } from '@/states/watch'
import { findWatchPost, getPostsNewestFirst, getWatchPostKeys, updateWatchPost } from '@/lib/watch-db'
import { findSignedInCookies } from '@/lib/watch-account'
import {
  instagramEmbedUrl,
  mediaFileName,
  mediaKey,
  mediaMimeType,
  mediaExpired,
  mediaToEvict,
  parseFacebookPostPage,
  parseInstagramEmbed,
  parseThreadsPostPage,
  refreshesMedia,
  threadsPostUrl,
  watchKey,
  type KeptMediaEntry,
  type WatchMedia,
  type WatchPost,
} from '@/lib/watch'

let Network: typeof import('expo-network') | undefined
let Sharing: typeof import('expo-sharing') | undefined
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Network = require('expo-network')
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Sharing = require('expo-sharing')
} catch (e) {
  console.warn('Failed to load expo-network or expo-sharing', e)
}

/**
 * The photos and videos of watched profiles' posts, kept on the phone so the feed shows them
 * without the site: ahead of time for new posts, or when one is opened.
 */

interface KeptMedia {
  name: string
  bytes: number
  postCreatedAt: number
  usedAt: number
}

export const watchMedia$ = observable<{ files: Record<string, KeptMedia> }>({ files: {} })

if (Platform.OS !== 'web') {
  syncObservable(watchMedia$, {
    persist: {
      name: 'watch-media',
      plugin: ObservablePersistMMKV,
    },
  })
}

const DESKTOP_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

// Between two requests for embed pages, as for profile pages.
const EMBED_GAP_MS = 1500
// Embed pages asked for in one run ahead of time; more are read when their posts are opened.
const EMBED_PAGES_PER_RUN = 20
const RUN_BUDGET_MS = {
  foreground: 2 * 60 * 1000,
  manual: 2 * 60 * 1000,
  background: Platform.OS === 'ios' ? 0 : 3 * 60 * 1000,
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

let directory: Directory | undefined
const mediaDirectory = () => {
  if (!directory) {
    directory = new Directory(Paths.document, 'watch-media')
    if (!directory.exists) {
      directory.create({ intermediates: true, idempotent: true })
    }
  }
  return directory
}

/** Where a kept file is, for an entry of `watchMedia$.files`. */
export const keptMediaUri = (kept: KeptMedia | undefined) => (kept ? new File(mediaDirectory(), kept.name).uri : undefined)

export const watchMediaUsageBytes = () =>
  Object.values(watchMedia$.files.peek()).reduce((sum, kept) => sum + (kept?.bytes || 0), 0)

// The post as it is now, in the list of the profile it was shown for.
const currentPost = (post: WatchPost) => findWatchPost(watchKey(post), post.key) || post

const updatePost = (post: WatchPost, patch: Partial<WatchPost>) => updateWatchPost(watchKey(post), post.key, patch)

// An embed page, or a photo or video, asked for by the gallery and a prefetch run at once is
// fetched once; each has a time limit of its own, whoever asked for it.
const detailRequests = new SharedRequests<{ media: WatchMedia[]; cover?: string }>(30 * 1000)
const downloadRequests = new SharedRequests<string | undefined>(5 * 60 * 1000)

/**
 * Whether an Instagram, Threads or Facebook post has to be read again from its own page: only its
 * cover is known, or an address of a photo or video that is not kept has expired.
 */
const needsDetails = (post: WatchPost) => {
  if (!refreshesMedia(post.site)) return false
  if (post.mediaComplete === false) return true
  return mediaExpired(notKeptMedia(post), Date.now())
}

/** The photos and videos of a post that are not kept on the phone, which are read from the site. */
const notKeptMedia = (post: WatchPost) => (post.media || []).filter((_, index) => !watchMedia$.files[mediaKey(post.key, index)].peek())

/**
 * All the media of a post. An Instagram post read from a profile page only has its cover, and
 * the rest is read from its embed page, which needs no account; a Threads or Facebook post whose
 * addresses have expired is read from its own page, a Facebook one with the account the feed
 * uses, as most profiles and all groups show their posts only to one, along with its cover. When
 * that fails, the addresses there are do while they have not expired yet.
 */
export const ensurePostMedia = async (
  post: WatchPost,
  { force = false, signal }: { force?: boolean; signal?: AbortSignal } = {},
): Promise<WatchMedia[]> => {
  if (!refreshesMedia(post.site) || (!force && !needsDetails(post))) {
    return post.media || []
  }
  // A post's own page, but for an Instagram post, its embed page.
  const ownPage = post.site !== 'instagram'
  const read = detailRequests.run(post.key, async (requestSignal) => {
    const account = post.site === 'facebook' ? await findSignedInCookies('facebook') : null
    const res = await fetch(ownPage ? threadsPostUrl(post) : instagramEmbedUrl(post.id), {
      signal: requestSignal,
      headers: {
        'user-agent': DESKTOP_USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
        // The embed page is in a frame of another site; a post's own page is a page of its own.
        'sec-fetch-dest': ownPage ? 'document' : 'iframe',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': ownPage ? 'none' : 'cross-site',
        ...(account ? { cookie: account.cookie } : {}),
      },
      credentials: 'omit',
    })
    if (!res.ok) throw new Error(`${ownPage ? 'post page' : 'embed'} HTTP ${res.status}`)
    const html = await res.text()
    if (post.site === 'threads') return { media: parseThreadsPostPage(html, post.id) }
    return ownPage ? parseFacebookPostPage(html, post) : { media: parseInstagramEmbed(html) }
  }, signal)
  let media: WatchMedia[]
  let cover: string | undefined
  try {
    ;({ media, cover } = await read)
  } catch (e) {
    // Addresses are read again a little before they expire: up to then they still work.
    if (force || signal?.aborted || post.mediaComplete === false || !post.media?.length) throw e
    if (mediaExpired(notKeptMedia(post), Date.now(), 0)) throw e
    return post.media
  }
  // Each caller's own copy: a post two profiles share is in both their lists.
  // A video Facebook only streams has no media, but a cover at a new address.
  updatePost(post, { media, mediaComplete: true, ...(cover && !media.length ? { image: cover } : {}) })
  return media
}

// The files being written by those downloads, which pruning leaves alone.
const namesInFlight = new Set<string>()
// Goes up each time the media is cleared: work begun before that is not kept.
let generation = 0

/** Work given up because the media was cleared meanwhile; not a failure to try again. */
class MediaClearedError extends Error {
  constructor() {
    super('media cleared')
  }
}
// The prefetch run going, cancelled when the media is cleared.
let syncController: AbortController | null = null

/** Keeps one photo or video of a post on the phone, and tells where it is. */
export const keepMediaItem = (
  post: WatchPost,
  index: number,
  item: WatchMedia,
  signal?: AbortSignal,
): Promise<string | undefined> => {
  const key = mediaKey(post.key, index)
  const kept = watchMedia$.files[key].peek()
  if (kept && new File(mediaDirectory(), kept.name).exists) {
    return Promise.resolve(keptMediaUri(kept))
  }
  return downloadRequests.run(key, async (requestSignal) => {
    const startedIn = generation
    const name = `${key.replace(/[^A-Za-z0-9_-]/g, '_')}.${mediaFileName(post, index, item).split('.').pop()}`
    const destination = new File(mediaDirectory(), name)
    namesInFlight.add(name)
    let file: File
    try {
      file = await File.downloadFileAsync(item.url, destination, {
        idempotent: true,
        headers: { 'user-agent': DESKTOP_USER_AGENT },
        signal: requestSignal,
      })
    } catch (e) {
      // A failed or cancelled download can leave part of the file behind, which nothing counts.
      try {
        if (destination.exists) destination.delete()
      } catch {}
      throw e
    } finally {
      namesInFlight.delete(name)
    }
    // Media cleared while this was out: it is not kept, so the cache stays as cleared.
    if (startedIn !== generation) {
      try {
        if (file.exists) file.delete()
      } catch {}
      throw new MediaClearedError()
    }
    watchMedia$.files[key].set({ name, bytes: file.size || 0, postCreatedAt: post.createdAtMs, usedAt: Date.now() })
    // Whatever kept it, the limit holds; a file in use stays until it is let go.
    pruneWatchMedia()
    return file.uri
  }, signal)
}

/**
 * Keeps one photo or video of a post, reading the post again first when its addresses have
 * expired, and once more if the download fails: an Instagram address can stop working early.
 */
export const keepPostMediaItem = async (post: WatchPost, index: number, signal?: AbortSignal) => {
  const media = await ensurePostMedia(post, { signal })
  if (!media[index]) return undefined
  try {
    return await keepMediaItem(post, index, media[index], signal)
  } catch (e) {
    if (!refreshesMedia(post.site) || signal?.aborted || e instanceof MediaClearedError) throw e
    const fresh = await ensurePostMedia(currentPost(post), { force: true, signal })
    return fresh[index] ? keepMediaItem(post, index, fresh[index], signal) : undefined
  }
}

/** Marks a kept file as just looked at; of two equally old posts, the one looked at longer ago goes first. */
export const touchMedia = (key: string) => {
  if (watchMedia$.files[key].peek()) {
    watchMedia$.files[key].usedAt.set(Date.now())
  }
}

const isOnWifi = async () => {
  if (!Network) return false
  try {
    const state = await Network.getNetworkStateAsync()
    return state.type === Network.NetworkStateType.WIFI || state.type === Network.NetworkStateType.ETHERNET
  } catch {
    return false
  }
}

// How many times each kept file is in use, shown in the gallery or being saved: not deleted meanwhile.
const inUse = new Map<string, number>()

/** Holds a kept file while it is shown or saved; returns what lets it go. */
export const holdMedia = (key: string) => {
  inUse.set(key, (inUse.get(key) || 0) + 1)
  let released = false
  return () => {
    if (released) return
    released = true
    const count = (inUse.get(key) || 1) - 1
    if (count > 0) inUse.set(key, count)
    else inUse.delete(key)
  }
}

/** Deletes the kept media of posts no longer kept, and of the oldest posts while over the limit. */
export const pruneWatchMedia = () => {
  const files = watchMedia$.files.peek()
  const live = getWatchPostKeys()
  const entries: KeptMediaEntry[] = Object.entries(files).map(([key, kept]) => ({ key, ...kept }))
  const evict = mediaToEvict(entries, watch$.mediaLimitMB.peek() * 1024 * 1024, live, new Set(inUse.keys()))
  for (const key of evict) {
    try {
      const file = new File(mediaDirectory(), files[key].name)
      if (file.exists) file.delete()
    } catch (e) {
      console.warn('watch media delete failed', key, e)
    }
    watchMedia$.files[key].delete()
  }
  // Files nothing keeps track of, as one left by a download the app did not live to finish.
  try {
    const tracked = new Set(Object.values(watchMedia$.files.peek()).map((kept) => kept?.name))
    for (const entry of mediaDirectory().list()) {
      if (entry instanceof File && !tracked.has(entry.name) && !namesInFlight.has(entry.name)) entry.delete()
    }
  } catch (e) {
    console.warn('watch media cleanup failed', e)
  }
}

export const clearWatchMedia = () => {
  generation += 1
  syncController?.abort()
  try {
    const dir = mediaDirectory()
    if (dir.exists) dir.delete()
  } catch (e) {
    console.warn('watch media clear failed', e)
  }
  directory = undefined
  watchMedia$.files.set({})
}

const oldestKeptPostTime = () =>
  Object.values(watchMedia$.files.peek()).reduce((min, kept) => Math.min(min, kept?.postCreatedAt ?? Infinity), Infinity)

let syncing: Promise<void> | null = null

/**
 * Keeps the media of the newest posts on the phone, newest first, until the limit is reached
 * or the run's time is up; only on Wi-Fi unless the setting says otherwise.
 */
export const syncWatchMedia = (source: keyof typeof RUN_BUDGET_MS): Promise<void> => {
  const budget = RUN_BUDGET_MS[source]
  if (!budget) return Promise.resolve()
  // A run already going may have more time than this one: it is waited for only as long as
  // this one may take, so a background task is not held past its own.
  if (syncing) return Promise.race([syncing, sleep(budget).then(() => undefined)])
  syncing = runSync(source).finally(() => {
    syncing = null
  })
  return syncing
}

const runSync = async (source: keyof typeof RUN_BUDGET_MS) => {
  if (Platform.OS === 'web') return
  pruneWatchMedia()
  const budget = RUN_BUDGET_MS[source]
  if (!budget || (watch$.mediaWifiOnly.peek() && !(await isOnWifi()))) return
  const start = Date.now()
  // Requests still out when the run's time is up are cancelled, so the run ends on time.
  const controller = new AbortController()
  syncController = controller
  const timer = setTimeout(() => controller.abort(), budget)
  try {
    await syncPosts(start, budget, controller.signal)
  } finally {
    clearTimeout(timer)
    if (syncController === controller) syncController = null
  }
  pruneWatchMedia()
}

// Read a page at a time: a run seldom gets far past the newest.
function* postsNewestFirst() {
  const pageSize = 100
  for (let offset = 0; ; offset += pageSize) {
    const page = getPostsNewestFirst(pageSize, offset)
    yield* page
    if (page.length < pageSize) return
  }
}

const syncPosts = async (start: number, budget: number, signal: AbortSignal) => {
  const limitBytes = watch$.mediaLimitMB.peek() * 1024 * 1024
  let embedPages = 0
  for (const post of postsNewestFirst()) {
    if (signal.aborted || Date.now() - start > budget) break
    // When nearly full, a post older than the oldest kept would be the next to go: everything
    // newer is kept already, so the run is done. The oldest kept itself is gone through again, as a
    // run can end partway through its photos.
    if (watchMediaUsageBytes() >= limitBytes * 0.9 && post.createdAtMs < oldestKeptPostTime()) break
    let media = post.media || []
    if (needsDetails(post)) {
      if (embedPages >= EMBED_PAGES_PER_RUN) continue
      if (embedPages > 0) await sleep(EMBED_GAP_MS)
      embedPages += 1
      try {
        media = await ensurePostMedia(post, { signal })
      } catch (e) {
        if (signal.aborted) break
        console.warn('watch media details failed', post.key, e)
        continue
      }
    }
    for (const [index, item] of media.entries()) {
      if (signal.aborted) break
      try {
        await keepMediaItem(post, index, item, signal)
      } catch (e) {
        if (!signal.aborted) console.warn('watch media download failed', post.key, index, e)
      }
    }
  }
}

/**
 * Saves all media of a post, or one of it, where the user's other apps see it: Downloads, or the
 * share sheet where that can't be written to. Resolves to how many files were saved or shared.
 */
// Android writes to the shared Downloads without asking from version 10 on; before that it takes
// a permission, so there, as on iOS, the file is handed to the share sheet instead.
export const savesToDownloads =
  Platform.OS === 'android' && Number(Platform.Version) >= 29 && Boolean(NoraViewModule.saveFileToDownloads)

export const saveWatchPostMedia = async (post: WatchPost, only?: number): Promise<number> => {
  post = currentPost(post)
  const media = await ensurePostMedia(post)
  let saved = 0
  for (const [index, item] of media.entries()) {
    if (only !== undefined && index !== only) continue
    // Held from before it is kept until it is copied out, so pruning can't take it in between.
    const release = holdMedia(mediaKey(post.key, index))
    try {
      const uri = await keepPostMediaItem(post, index)
      if (!uri) continue
      if (savesToDownloads && NoraViewModule.saveFileToDownloads) {
        if (await NoraViewModule.saveFileToDownloads(uri, mediaFileName(post, index, item), mediaMimeType(item))) saved += 1
      } else if (Sharing && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, { mimeType: mediaMimeType(item) })
        saved += 1
      }
    } finally {
      release()
    }
  }
  pruneWatchMedia()
  return saved
}

// The media of a post that is no longer kept goes with it.
if (Platform.OS !== 'web') {
  watch$.profiles.onChange(({ getPrevious, value }) => {
    // After the unwatch is done: it takes the profile out first, and its posts after.
    if ((getPrevious()?.length || 0) > value.length) setTimeout(pruneWatchMedia, 0)
  })
  watch$.mediaLimitMB.onChange(() => pruneWatchMedia())
  watch$.postsPerSource.onChange(() => pruneWatchMedia())
}

