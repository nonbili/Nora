import type { WatchFetchResult, WatchMedia } from '../types'
import { splitMastodonHandle } from '../target'
import { htmlToText } from '../html'

/** The account of a handle on the server it is on; its posts are asked for by the account's id. */
export const mastodonLookupUrl = (handle: string, server = splitMastodonHandle(handle).host) =>
  `https://${server}/api/v1/accounts/lookup?acct=${encodeURIComponent(handle)}`

export const mastodonStatusesUrl = (server: string, id: string) =>
  `https://${server}/api/v1/accounts/${encodeURIComponent(id)}/statuses?limit=30&exclude_replies=true`

/**
 * Where an account is asked about, which a handle's domain may only name: a server can give its
 * accounts the handles of another domain. Its WebFinger answer links the account on its own server.
 */
export const mastodonWebFingerUrl = (handle: string) =>
  `https://${splitMastodonHandle(handle).host}/.well-known/webfinger?resource=${encodeURIComponent(`acct:${handle}`)}`

export function parseMastodonWebFinger(json: any): string {
  const self = (Array.isArray(json?.links) ? json.links : []).find(
    (link: any) => link?.rel === 'self' && typeof link.href === 'string',
  )
  try {
    return new URL(self.href).host
  } catch {
    throw new Error('no account')
  }
}

const mastodonMedia = (attachment: any): WatchMedia | null => {
  const url: string | undefined = attachment?.url || attachment?.remote_url
  if (!url) return null
  const original = attachment.meta?.original
  const size = { width: original?.width, height: original?.height }
  if (attachment.type === 'image') return { type: 'image', url, thumb: attachment.preview_url || undefined, ...size }
  if (attachment.type === 'video' || attachment.type === 'gifv') return { type: 'video', url, thumb: attachment.preview_url || undefined, ...size }
  return null
}

const mastodonMediaOf = (status: any): WatchMedia[] =>
  (status.media_attachments || []).map(mastodonMedia).filter((item: WatchMedia | null): item is WatchMedia => Boolean(item))

/** The posts of an account, as the server it is on, `server`, has them. */
export function parseMastodonStatuses(account: any, statuses: any, handle: string, server = splitMastodonHandle(handle).host): WatchFetchResult {
  if (!Array.isArray(statuses)) {
    throw new Error(statuses?.error || 'no posts')
  }
  const posts: WatchFetchResult['posts'] = []
  for (const status of statuses) {
    const shown = status?.reblog || status
    if (!shown?.id) continue
    const media = mastodonMediaOf(shown)
    // Mastodon's quotes; some other servers give the quoted post as the quote itself.
    const quoted = shown.quote?.quoted_status || (shown.quote?.id ? shown.quote : undefined)
    // A quote's content starts with a link to what it quotes, for apps that do not show quotes.
    const html: string = shown.content || ''
    const content = htmlToText(quoted?.id ? html.replace(/<p class="quote-inline">[\s\S]*?<\/p>/, '') : html)
    posts.push({
      // The same post has an id of its own on each server; its address is the same everywhere.
      id: shown.uri || shown.id,
      site: 'mastodon',
      handle,
      // On the profile's own server, where the post has this id.
      url: `https://${server}/@${shown.account?.acct || splitMastodonHandle(handle).user}/${shown.id}`,
      text: [shown.spoiler_text, content].filter(Boolean).join('\n\n'),
      image: media[0]?.thumb || media[0]?.url || shown.card?.image || undefined,
      media,
      link: !media.length && shown.card?.image ? shown.card.url || undefined : undefined,
      mediaComplete: true,
      createdAtMs: Date.parse(status.created_at) || 0,
      repostOf: status.reblog ? shown.account?.acct : undefined,
      quote: quoted?.id
        ? {
            handle: quoted.account?.acct || '',
            name: quoted.account?.display_name || undefined,
            avatar: quoted.account?.avatar || undefined,
            url: quoted.url || quoted.uri,
            text: [quoted.spoiler_text, htmlToText(quoted.content || '')].filter(Boolean).join('\n\n'),
            media: mastodonMediaOf(quoted),
            createdAtMs: Date.parse(quoted.created_at) || undefined,
          }
        : undefined,
    })
  }
  const url = typeof account?.url === 'string' && /^https:\/\//.test(account.url) ? account.url : undefined
  return { info: { name: account?.display_name || undefined, avatar: account?.avatar || undefined, url }, posts }
}
