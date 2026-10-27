import type { WatchFetchResult, WatchMedia, WatchProfileInfo, WatchQuote } from '../types'

/** A profile's posts and reposts, without its replies, from Bluesky's public API: it needs no account. */
export const blueskyFeedUrl = (handle: string) =>
  `https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=30&filter=posts_no_replies`

// Bluesky's own server, which sends a request on to the server of an account it hosts.
const BLUESKY_PDS = 'https://bsky.social'

/**
 * A video's own file, as it was uploaded, from the server of the account it is in, its PDS. The feed
 * has it only as a stream, which can't be kept on the phone.
 */
export const blueskyVideoUrl = (did: string, cid: string, pds = BLUESKY_PDS) =>
  `${pds}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`

/** Where the document of an account's id is, which tells the server it is on. */
export const didDocumentUrl = (did: string): string | undefined => {
  if (did.startsWith('did:plc:')) return `https://plc.directory/${did}`
  if (!did.startsWith('did:web:')) return undefined
  try {
    const [host, ...path] = did.slice('did:web:'.length).split(':').map(decodeURIComponent)
    return path.length ? `https://${host}/${path.join('/')}/did.json` : `https://${host}/.well-known/did.json`
  } catch {
    return undefined
  }
}

/** The server an account is on, its PDS, from the document of its id. */
export function parseDidDocumentPds(json: any): string | undefined {
  const service = (Array.isArray(json?.service) ? json.service : []).find(
    (entry: any) => typeof entry?.id === 'string' && entry.id.endsWith('#atproto_pds'),
  )
  const endpoint = service?.serviceEndpoint
  return typeof endpoint === 'string' && /^https:\/\/[^/]+/.test(endpoint) ? endpoint.replace(/\/+$/, '') : undefined
}

const AT_POST_URI = /^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/

const utf8Length = (codePoint: number) => (codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4)

/** The text of a post with its links in full: Bluesky shortens them, and tells where each is in bytes of UTF-8. */
export function expandBlueskyLinks(text: string, facets: any): string {
  const links = (Array.isArray(facets) ? facets : [])
    .map((facet: any) => ({
      start: facet?.index?.byteStart,
      end: facet?.index?.byteEnd,
      uri: facet?.features?.find((feature: any) => feature?.$type === 'app.bsky.richtext.facet#link')?.uri,
    }))
    .filter((link) => typeof link.uri === 'string' && Number.isInteger(link.start) && link.end > link.start)
    .sort((a, b) => a.start - b.start)
  if (!links.length) return text
  let out = ''
  let byte = 0
  let next = 0
  let written = -1
  for (const char of text) {
    while (links[next] && byte >= links[next].end) next += 1
    const link = links[next]
    if (!link || byte < link.start) {
      out += char
    } else if (written !== next) {
      out += link.uri
      written = next
    }
    byte += utf8Length(char.codePointAt(0)!)
  }
  return out
}

const embeddedMedia = (embed: any) => (embed?.$type === 'app.bsky.embed.recordWithMedia#view' ? embed.media : embed)

/** The post a post quotes, alone or with media of its own; not one that was deleted or blocked. */
const blueskyQuoted = (embed: any) => {
  const record = embed?.$type === 'app.bsky.embed.recordWithMedia#view' ? embed.record?.record : embed?.$type === 'app.bsky.embed.record#view' ? embed.record : undefined
  return record?.$type === 'app.bsky.embed.record#viewRecord' && typeof record.uri === 'string' ? record : undefined
}

/** The accounts whose videos are in a feed, quoted ones too: the server each is on is asked for before the feed is read. */
export function blueskyVideoDids(json: any): string[] {
  const dids = new Set<string>()
  const add = (uri: unknown, embed: any) => {
    const did = typeof uri === 'string' ? uri.match(AT_POST_URI)?.[1] : undefined
    if (did && embeddedMedia(embed)?.$type === 'app.bsky.embed.video#view') dids.add(did)
  }
  for (const item of Array.isArray(json?.feed) ? json.feed : []) {
    add(item?.post?.uri, item?.post?.embed)
    const quoted = blueskyQuoted(item?.post?.embed)
    add(quoted?.uri, quoted?.embeds?.[0])
  }
  return [...dids]
}

const blueskyMedia = (embed: any, did: string, pds?: string): WatchMedia[] => {
  const media = embeddedMedia(embed)
  const size = (aspectRatio: any) => ({ width: aspectRatio?.width, height: aspectRatio?.height })
  if (media?.$type === 'app.bsky.embed.images#view') {
    return (media.images || [])
      .filter((image: any) => image?.fullsize)
      .map((image: any): WatchMedia => ({ type: 'image', url: image.fullsize, thumb: image.thumb, ...size(image.aspectRatio) }))
  }
  if (media?.$type === 'app.bsky.embed.video#view' && media.cid) {
    return [{ type: 'video', url: blueskyVideoUrl(did, media.cid, pds), thumb: media.thumbnail, ...size(media.aspectRatio) }]
  }
  return []
}

/** `pdsOf` tells the server of an account, where its videos are; Bluesky's own when it is not known. */
export function parseBlueskyFeed(json: any, handle: string, pdsOf: (did: string) => string | undefined = () => undefined): WatchFetchResult {
  if (!Array.isArray(json?.feed)) {
    throw new Error(json?.message || 'no feed')
  }
  const info: WatchProfileInfo = {}
  const posts: WatchFetchResult['posts'] = []
  for (const item of json.feed) {
    const post = item?.post
    const parts = typeof post?.uri === 'string' ? post.uri.match(AT_POST_URI) : null
    if (!parts) continue
    const [, did, rkey] = parts
    const repost = item.reason?.$type === 'app.bsky.feed.defs#reasonRepost'
    // Everything in the feed is the profile's own post or its repost.
    const owner = repost ? item.reason.by : post.author
    if (!info.name && !info.avatar && owner) {
      info.name = owner.displayName || undefined
      info.avatar = owner.avatar || undefined
    }
    const media = blueskyMedia(post.embed, did, pdsOf(did))
    const external = post.embed?.$type === 'app.bsky.embed.external#view' ? post.embed.external : undefined
    let text = expandBlueskyLinks(post.record?.text || '', post.record?.facets)
    if (external?.uri && !text.includes(external.uri)) text = text ? `${text}\n${external.uri}` : external.uri
    const quoted = blueskyQuoted(post.embed)
    const quotedParts = quoted?.uri.match(AT_POST_URI)
    let quote: WatchQuote | undefined
    if (quoted && quotedParts) {
      const [, quotedDid, quotedRkey] = quotedParts
      const quotedEmbed = quoted.embeds?.[0]
      const quotedExternal = quotedEmbed?.$type === 'app.bsky.embed.external#view' ? quotedEmbed.external : undefined
      let quotedText = expandBlueskyLinks(quoted.value?.text || '', quoted.value?.facets)
      if (quotedExternal?.uri && !quotedText.includes(quotedExternal.uri)) quotedText = quotedText ? `${quotedText}\n${quotedExternal.uri}` : quotedExternal.uri
      quote = {
        handle: quoted.author?.handle || quotedDid,
        name: quoted.author?.displayName || undefined,
        avatar: quoted.author?.avatar || undefined,
        url: `https://bsky.app/profile/${quoted.author?.handle || quotedDid}/post/${quotedRkey}`,
        text: quotedText,
        media: blueskyMedia(quotedEmbed, quotedDid, pdsOf(quotedDid)),
        createdAtMs: Date.parse(quoted.value?.createdAt || quoted.indexedAt) || undefined,
      }
    }
    posts.push({
      // A record's key is only unique within its author's repository.
      id: `${did}/${rkey}`,
      site: 'bluesky',
      handle,
      url: `https://bsky.app/profile/${post.author?.handle || did}/post/${rkey}`,
      text,
      image: media[0]?.thumb || media[0]?.url || external?.thumb,
      media,
      link: !media.length && external?.thumb ? external.uri : undefined,
      mediaComplete: true,
      // A repost shows up in the feed when it was reposted.
      createdAtMs: Date.parse((repost ? item.reason.indexedAt : post.record?.createdAt) || post.indexedAt) || 0,
      repostOf: repost ? post.author?.handle : undefined,
      quote,
    })
  }
  return { info, posts }
}
