import {
  parseRedditCommunityCard,
  parseRedditListing,
  parseRedditPosts,
  redditCommunityCardUrl,
  redditListingUrl,
  redditPostsUrl,
  type WatchFetchResult,
  type WatchSite,
} from '@/lib/watch'
import { watchFetch } from '@/lib/watch-fetch'
import { watch$ } from '@/states/watch'
import {
  checkStatus,
  DESKTOP_USER_AGENT,
  fetchText,
  REQUEST_GAP_MS,
  sleep,
  timeLeft,
  WatchFetchError,
  withDeadline,
  type WatchRunSource,
} from './common'

const fetchRedditListing = (handle: string, cookie: string, deadline: number): Promise<WatchFetchResult> =>
  withDeadline(deadline, async (signal) => {
    const res = await watchFetch(redditListingUrl(handle), {
      signal,
      headers: { 'user-agent': DESKTOP_USER_AGENT, accept: 'application/json', cookie },
      credentials: 'omit',
    })
    checkStatus(res, true)
    let json: any
    try {
      json = await res.json()
    } catch (e) {
      if (signal.aborted) throw e
      throw new WatchFetchError('not JSON')
    }
    return parseRedditListing(json, handle)
  })

const hasAvatar = (site: WatchSite, handle: string) =>
  watch$.profiles.peek().some((profile) => profile.site === site && profile.handle === handle && profile.avatar)

/**
 * With an account, Reddit's data for the subreddit or user; without one, or when that fails, the
 * posts as Reddit's own page loads them. A subreddit's picture is not among those, and is read
 * from its card, once.
 */
export const fetchReddit = async (handle: string, cookie: string, _source: WatchRunSource, deadline: number): Promise<WatchFetchResult> => {
  if (cookie) {
    try {
      return await fetchRedditListing(handle, cookie, deadline)
    } catch (e) {
      console.warn('watch reddit listing failed', handle, e)
    }
  }
  const result = parseRedditPosts(await fetchText(redditPostsUrl(handle), { accept: 'text/html' }, deadline), handle)
  if (result.info.avatar || !handle.startsWith('r/') || hasAvatar('reddit', handle) || !timeLeft(deadline)) return result
  try {
    await sleep(REQUEST_GAP_MS)
    return { ...result, info: { ...result.info, avatar: parseRedditCommunityCard(await fetchText(redditCommunityCardUrl(handle), { accept: 'text/html' }, deadline)) } }
  } catch (e) {
    console.warn('watch reddit community card failed', handle, e)
    return result
  }
}
