/** Reading a watched source's latest posts from its site, each site in its own way. */

import type { WatchFetchResult, WatchSite } from '@/lib/watch'
import type { SiteAccount } from '@/lib/watch-account'
import type { WatchRunSource } from './common'
import { fetchX } from './x'
import { fetchInstagram } from './instagram'
import { fetchThreads } from './threads'
import { fetchBluesky } from './bluesky'
import { fetchMastodon } from './mastodon'
import { fetchReddit } from './reddit'
import { fetchFacebook } from './facebook'
import { fetchTikTok } from './tiktok'

export * from './common'
export { fetchImginn, imginnBlocked$, resumeImginn } from './instagram'

export type WatchFetcher = (
  handle: string,
  cookie: string,
  source: WatchRunSource,
  deadline: number,
  account: SiteAccount | null,
) => Promise<WatchFetchResult>

export const fetchers: Record<WatchSite, WatchFetcher> = {
  x: fetchX,
  instagram: fetchInstagram,
  threads: fetchThreads,
  bluesky: fetchBluesky,
  mastodon: fetchMastodon,
  reddit: fetchReddit,
  facebook: fetchFacebook,
  tiktok: fetchTikTok,
}
