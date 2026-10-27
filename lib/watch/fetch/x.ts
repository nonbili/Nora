import { parseXTimeline, xTimelineUrl, type WatchFetchResult } from '@/lib/watch'
import { watchFetch } from '@/lib/watch-fetch'
import { checkStatus, DESKTOP_USER_AGENT, withDeadline, type WatchRunSource } from './common'

export const fetchX = (handle: string, cookie: string, _source: WatchRunSource, deadline: number): Promise<WatchFetchResult> =>
  withDeadline(deadline, async (signal) => {
    const res = await watchFetch(xTimelineUrl(handle), {
      signal,
      headers: {
        'user-agent': DESKTOP_USER_AGENT,
        accept: 'text/html',
        'accept-language': 'en-US,en;q=0.9',
        ...(cookie ? { cookie } : {}),
      },
      // Only the cookies of the profile chosen above, never those the app's own requests keep.
      credentials: 'omit',
    })
    checkStatus(res, Boolean(cookie))
    return parseXTimeline(await res.text(), handle)
  })
