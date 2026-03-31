function getFacebookVideoId(slugs: string[], searchParams: URLSearchParams) {
  if (slugs[1] === 'reel' && slugs[2]) {
    return slugs[2]
  }
  if (slugs[1] === 'watch') {
    return searchParams.get('v') || undefined
  }
  const videosIndex = slugs.indexOf('videos')
  if (videosIndex > -1) {
    const videoId = [...slugs].reverse().find((slug) => /^\d+$/.test(slug))
    if (videoId) {
      return videoId
    }
  }
}

function isTikTokDownloadPath(slugs: string[]) {
  return slugs[2] === 'video' && /^\d+$/.test(slugs[3] || '')
}

function isFacebookDownloadPath(slugs: string[], searchParams: URLSearchParams) {
  return Boolean(getFacebookVideoId(slugs, searchParams) || slugs[1] === 'stories')
}

function decodeFacebookUrl(url: string) {
  return url.replace(/\\\//g, '/').replaceAll('\\u0025', '%').replaceAll('&amp;', '&')
}

function decodeEscapedUrl(url: string) {
  return url
    .replace(/\\u0026/gi, '&')
    .replace(/\\u002F/gi, '/')
    .replace(/\\\//g, '/')
    .replaceAll('&amp;', '&')
}

type FacebookUrlCandidate = {
  score: number
  url: string
}

export type FacebookDownloadInfo = {
  hdVideoOnlyUrl?: string
  standardWithAudioUrl?: string
}

type TikTokUrlCandidate = {
  score: number
  url: string
}

function addTikTokCandidate(candidates: TikTokUrlCandidate[], url: string | null | undefined, score: number) {
  if (!url?.startsWith('https://')) {
    return
  }
  candidates.push({ url, score })
}

function collectTikTokUrlValue(candidates: TikTokUrlCandidate[], value: unknown, score: number) {
  if (typeof value === 'string') {
    addTikTokCandidate(candidates, value, score)
    return
  }
  if (!value || typeof value !== 'object') {
    return
  }

  const record = value as Record<string, unknown>
  const urlList = record.urlList
  if (Array.isArray(urlList)) {
    for (const entry of urlList) {
      addTikTokCandidate(candidates, typeof entry === 'string' ? entry : undefined, score)
    }
  }

  addTikTokCandidate(candidates, typeof record.src === 'string' ? record.src : undefined, score)
  addTikTokCandidate(candidates, typeof record.url === 'string' ? record.url : undefined, score)
}

function collectTikTokStructuredCandidates(value: unknown, candidates: TikTokUrlCandidate[]) {
  if (!value || typeof value !== 'object') {
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectTikTokStructuredCandidates(item, candidates)
    }
    return
  }

  const record = value as Record<string, unknown>
  collectTikTokUrlValue(candidates, record.playAddr, 540)
  collectTikTokUrlValue(candidates, record.downloadAddr, 520)
  collectTikTokUrlValue(candidates, record.download, 500)
  collectTikTokUrlValue(candidates, record.play, 480)

  for (const child of Object.values(record)) {
    collectTikTokStructuredCandidates(child, candidates)
  }
}

export function getTikTokDownloadUrl(scriptSources: string[] = []) {
  const candidates: TikTokUrlCandidate[] = []

  for (const source of scriptSources) {
    const trimmed = source.trim()
    if (!trimmed) {
      continue
    }

    try {
      collectTikTokStructuredCandidates(JSON.parse(trimmed), candidates)
    } catch (e) {}

    const patterns: Array<[RegExp, number]> = [
      [/"playAddr":"((?:https?:)?[^"]+)"/g, 540],
      [/"downloadAddr":"((?:https?:)?[^"]+)"/g, 520],
      [/"urlList":\["((?:https?:)?[^"]+)"/g, 500],
    ]
    for (const [pattern, score] of patterns) {
      for (const match of source.matchAll(pattern)) {
        addTikTokCandidate(candidates, decodeEscapedUrl(match[1]), score)
      }
    }
  }

  return candidates.sort((a, b) => b.score - a.score)[0]?.url
}

function addFacebookCandidate(candidates: FacebookUrlCandidate[], url: string | null | undefined, score: number) {
  if (!url?.startsWith('https://')) {
    return
  }
  candidates.push({ url, score })
}

function collectFacebookStructuredCandidates(
  value: unknown,
  progressiveCandidates: FacebookUrlCandidate[],
  dashCandidates: FacebookUrlCandidate[],
) {
  if (!value || typeof value !== 'object') {
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectFacebookStructuredCandidates(item, progressiveCandidates, dashCandidates)
    }
    return
  }

  const record = value as Record<string, unknown>
  const urlScores: Record<string, number> = {
    browser_native_hd_url: 520,
    playable_url_quality_hd: 500,
    browser_native_sd_url: 380,
    playable_url: 360,
  }

  for (const [key, score] of Object.entries(urlScores)) {
    addFacebookCandidate(progressiveCandidates, typeof record[key] === 'string' ? (record[key] as string) : undefined, score)
  }

  const representations = record.dash_prefetch_representations
  if (representations && typeof representations === 'object' && !Array.isArray(representations)) {
    const entries = (representations as Record<string, unknown>).representations
    if (Array.isArray(entries)) {
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          continue
        }
        const representation = entry as Record<string, unknown>
        if (typeof representation.mime_type === 'string' && representation.mime_type.startsWith('audio/')) {
          continue
        }
        const url = typeof representation.base_url === 'string' ? representation.base_url : undefined
        const height = typeof representation.height === 'number' ? representation.height : 0
        addFacebookCandidate(dashCandidates, url, 100 + Math.round(height / 10))
      }
    }
  }

  for (const child of Object.values(record)) {
    collectFacebookStructuredCandidates(child, progressiveCandidates, dashCandidates)
  }
}

function collectFacebookHtmlCandidates(
  html: string,
  progressiveCandidates: FacebookUrlCandidate[],
  dashCandidates: FacebookUrlCandidate[],
) {
  const progressivePatterns: Array<[RegExp, number]> = [
    [/(?:browser_native_hd_url|playable_url_quality_hd)"\s*:\s*"(https:.+?)"/g, 520],
    [/(?:browser_native_sd_url|playable_url)"\s*:\s*"(https:.+?)"/g, 380],
    [/\\u0022(?:browser_native_hd_url|playable_url_quality_hd)\\u0022:\s*\\u0022(https:.+?)\\u0022/g, 520],
    [/\\u0022(?:browser_native_sd_url|playable_url)\\u0022:\s*\\u0022(https:.+?)\\u0022/g, 380],
  ]

  for (const [pattern, score] of progressivePatterns) {
    for (const match of html.matchAll(pattern)) {
      addFacebookCandidate(progressiveCandidates, decodeFacebookUrl(match[1]), score)
    }
  }

  const dashPattern = /\\u003CBaseURL>(https:.+?)\\u003C/g
  for (const match of html.matchAll(dashPattern)) {
    addFacebookCandidate(dashCandidates, decodeFacebookUrl(match[1]), 120)
  }
}

function getTopCandidate(candidates: FacebookUrlCandidate[]) {
  return candidates.sort((a, b) => b.score - a.score)[0]?.url
}

export function normalizeDownloadUrl(url: string) {
  try {
    const parsed = new URL(url)
    const slugs = parsed.pathname.split('/')
    const videoId = getFacebookVideoId(slugs, parsed.searchParams)
    if (videoId && parsed.hostname.endsWith('facebook.com')) {
      parsed.hostname = 'm.facebook.com'
      parsed.pathname = `/reel/${videoId}/`
      parsed.search = ''
      parsed.hash = ''
    }
    return parsed.href
  } catch (e) {
    return url
  }
}

export function isDownloadable(url: string) {
  let hostname, pathname, searchParams
  try {
    ;({ hostname, pathname, searchParams } = new URL(url))
  } catch (e) {
    return false
  }

  const slugs = pathname.split('/')
  switch (hostname) {
    case 'm.facebook.com':
    case 'www.facebook.com':
      return isFacebookDownloadPath(slugs, searchParams)
    case 'www.instagram.com':
      return ['reel', 'reels'].includes(slugs[1]) || slugs[2] == 'reel'
    case 'www.tiktok.com':
      return isTikTokDownloadPath(slugs)
  }
  return false
}

export function isDirectlyDownloadable(url: string) {
  let hostname, pathname
  try {
    ;({ hostname, pathname } = new URL(url))
  } catch (e) {
    return false
  }

  const slugs = pathname.split('/')
  switch (hostname) {
    case 'm.facebook.com':
      return ['reel', 'stories', 'watch'].includes(slugs[1])
    case 'www.facebook.com':
      return slugs[1] === 'reel'
    case 'www.instagram.com':
      return ['reel', 'reels'].includes(slugs[1]) || slugs[2] == 'reel'
    case 'www.tiktok.com':
      return isTikTokDownloadPath(slugs)
  }
  return false
}

export function getFacebookDownloadInfo(dataExtras: string[] = [], htmlSources: string[] = [], dataVideoUrls: string[] = []): FacebookDownloadInfo {
  const progressiveCandidates: FacebookUrlCandidate[] = []
  const dashCandidates: FacebookUrlCandidate[] = []

  for (const dataExtra of dataExtras) {
    try {
      collectFacebookStructuredCandidates(JSON.parse(dataExtra), progressiveCandidates, dashCandidates)
    } catch (e) {}
  }

  for (const html of htmlSources) {
    collectFacebookHtmlCandidates(html, progressiveCandidates, dashCandidates)
  }

  for (const dataVideoUrl of dataVideoUrls) {
    // `data-video-url` is often muxed with audio, but can be lower quality than HD metadata.
    addFacebookCandidate(progressiveCandidates, dataVideoUrl, 400)
  }

  return {
    hdVideoOnlyUrl: getTopCandidate(dashCandidates),
    standardWithAudioUrl: getTopCandidate(progressiveCandidates),
  }
}
