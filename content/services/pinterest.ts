import { BaseService, type InterceptedRequest, type TransformOptions } from './base'

interface PinterestPin {
  type?: string
  is_promoted?: boolean | null
  is_downstream_promotion?: boolean | null
  promoter?: object | null
}

// Pinterest serves its site from www and country subdomains (jp., de., ...) and a few
// country domains (pinterest.co.uk, pinterest.fr, ...).
export const isPinterestHost = (host: string) => /^(?:[a-z]{2,3}\.)?pinterest\.(?:com|co\.[a-z]{2}|com\.[a-z]{2}|[a-z]{2})$/.test(host)

// Mirrors the web app's own check. A saved copy of an ad keeps its "Promoted by" label
// through `is_downstream_promotion`, which falls back to whether a promoter is attached.
export const isPromotedPin = (item: unknown) => {
  if (!item || typeof item !== 'object') {
    return false
  }
  const pin = item as PinterestPin
  return pin.is_promoted === true || (pin.is_downstream_promotion ?? pin.promoter != null) === true
}

const withoutPromoted = (items: unknown[]) => {
  const kept = items.filter((item) => !isPromotedPin(item))
  return kept.length === items.length ? null : kept
}

const promotedMarker = /"(?:is_promoted|is_downstream_promotion)"\s*:\s*true|"promoter"\s*:\s*\{/
const mayHavePromoted = (text: string) => promotedMarker.test(text)

// A resource response's pins: `data` for the home feed and boards, `data.results` for search.
// Returns whether anything was dropped.
const filterResource = (resource: any) => {
  const data = resource?.data
  if (Array.isArray(data)) {
    const kept = withoutPromoted(data)
    if (kept) resource.data = kept
    return !!kept
  }
  if (Array.isArray(data?.results)) {
    const kept = withoutPromoted(data.results)
    if (kept) data.results = kept
    return !!kept
  }
  return false
}

export const initialPropsId = '__PWS_INITIAL_PROPS__'

/**
 * The first page of a feed is rendered on the server and handed to the app in the
 * `__PWS_INITIAL_PROPS__` script, as `initialReduxState.resources.<Resource>.<options>`
 * entries shaped like a resource response. Returns the filtered JSON, or null when
 * nothing changed (or the text is not complete JSON yet).
 */
export const filterInitialProps = (text: string) => {
  if (!mayHavePromoted(text)) {
    return null
  }
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }
  const resources = json?.initialReduxState?.resources
  if (!resources || typeof resources !== 'object') {
    return null
  }
  let changed = false
  for (const byOptions of Object.values(resources)) {
    if (!byOptions || typeof byOptions !== 'object') continue
    for (const resource of Object.values(byOptions as Record<string, unknown>)) {
      changed = filterResource(resource) || changed
    }
  }
  return changed ? JSON.stringify(json) : null
}

export class PinterestService extends BaseService {
  shouldIntercept(url: string) {
    try {
      const { host, pathname } = new URL(url)
      return isPinterestHost(host) && pathname.startsWith('/resource/') && pathname.endsWith('/get/')
    } catch {
      return false
    }
  }

  transformResponse(res: string, _request: InterceptedRequest, { blockAds }: TransformOptions) {
    // Pins without any promotion fields can't be ads; skip parsing everything else.
    if (!blockAds || !mayHavePromoted(res)) {
      return res
    }
    const json = JSON.parse(res)
    return filterResource(json?.resource_response) ? JSON.stringify(json) : res
  }
}
