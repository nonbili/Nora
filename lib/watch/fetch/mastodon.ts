import {
  mastodonLookupUrl,
  mastodonStatusesUrl,
  mastodonWebFingerUrl,
  parseMastodonStatuses,
  parseMastodonWebFinger,
  splitMastodonHandle,
} from '@/lib/watch'
import { fetchJson, isRateLimited, WatchFetchError, type WatchRunSource } from './common'

// The server each handle was found on, when that is not its domain.
const mastodonServers = new Map<string, string>()

const lookUpMastodon = async (handle: string, server: string, deadline: number) => {
  const account = await fetchJson(mastodonLookupUrl(handle, server), deadline)
  if (!account?.id) throw new WatchFetchError(account?.error || 'no account')
  return account
}

// Asked of the profile's own server; one that only answers with an account fails.
export const fetchMastodon = async (handle: string, _cookie: string, _source: WatchRunSource, deadline: number) => {
  let server = mastodonServers.get(handle) || splitMastodonHandle(handle).host
  let account: any
  try {
    account = await lookUpMastodon(handle, server, deadline)
  } catch (e) {
    if (isRateLimited(e) || mastodonServers.has(handle)) throw e
    // The handle's domain may not be the server the account is on.
    server = parseMastodonWebFinger(await fetchJson(mastodonWebFingerUrl(handle), deadline))
    if (server === splitMastodonHandle(handle).host) throw e
    account = await lookUpMastodon(handle, server, deadline)
    mastodonServers.set(handle, server)
  }
  return parseMastodonStatuses(account, await fetchJson(mastodonStatusesUrl(server, account.id), deadline), handle, server)
}
