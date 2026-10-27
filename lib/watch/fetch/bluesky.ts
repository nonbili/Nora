import { blueskyFeedUrl, blueskyVideoDids, didDocumentUrl, parseBlueskyFeed, parseDidDocumentPds } from '@/lib/watch'
import { fetchJson, isRateLimited, timeLeft, type WatchRunSource } from './common'

// The server each Bluesky account with a video is on, where its videos are kept.
const blueskyServers = new Map<string, string>()

export const fetchBluesky = async (handle: string, _cookie: string, _source: WatchRunSource, deadline: number) => {
  const json = await fetchJson(blueskyFeedUrl(handle), deadline)
  for (const did of blueskyVideoDids(json)) {
    const url = didDocumentUrl(did)
    if (blueskyServers.has(did) || !url || !timeLeft(deadline)) continue
    try {
      const pds = parseDidDocumentPds(await fetchJson(url, deadline))
      if (pds) blueskyServers.set(did, pds)
    } catch (e) {
      // Bluesky's own server is asked instead, which has the videos of the accounts it hosts.
      if (isRateLimited(e)) break
      console.warn('watch bluesky server lookup failed', did, e)
    }
  }
  return parseBlueskyFeed(json, handle, (did) => blueskyServers.get(did))
}
