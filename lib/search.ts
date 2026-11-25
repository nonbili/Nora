export interface SearchProviderInput {
  name: string
  templateUrl: string
}

export interface CustomSearchProvider extends SearchProviderInput {
  id: string
  iconUrl?: string
}

export type BuiltinSearchProviderId =
  | 'url'
  | 'duckduckgo'
  | 'google'
  | 'bluesky'
  | 'facebook'
  | 'facebook-messenger'
  | 'instagram'
  | 'linkedin'
  | 'pinterest'
  | 'reddit'
  | 'threads'
  | 'tiktok'
  | 'tumblr'
  | 'vk'
  | 'x'

export type SearchProviderKind = 'url' | 'builtin' | 'custom'

export interface BuiltinSearchProviderDefinition {
  id: BuiltinSearchProviderId
  name: string
  kind: 'url' | 'builtin'
  templateUrl?: string
  serviceId?: string
}

export interface ResolvedSearchProvider {
  id: string
  name: string
  kind: SearchProviderKind
  templateUrl?: string
  iconUrl?: string
  serviceId?: string
}

const encodedPlaceholder = '__NORA_SEARCH_QUERY__'

export const defaultEnabledSearchProviderIds = ['url', 'duckduckgo', 'google'] as const

export const builtinSearchProviders: Record<BuiltinSearchProviderId, BuiltinSearchProviderDefinition> = {
  url: {
    id: 'url',
    name: 'URL',
    kind: 'url',
  },
  duckduckgo: {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    kind: 'builtin',
    templateUrl: 'https://duckduckgo.com/?q=%s',
  },
  google: {
    id: 'google',
    name: 'Google',
    kind: 'builtin',
    templateUrl: 'https://www.google.com/search?q=%s',
  },
  bluesky: {
    id: 'bluesky',
    name: 'Bluesky',
    kind: 'builtin',
    templateUrl: 'https://bsky.app/search?q=%s',
    serviceId: 'bluesky',
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook',
    kind: 'builtin',
    templateUrl: 'https://www.facebook.com/search/top/?q=%s',
    serviceId: 'facebook',
  },
  'facebook-messenger': {
    id: 'facebook-messenger',
    name: 'Facebook Messenger',
    kind: 'builtin',
    templateUrl: 'https://www.facebook.com/messages/search/?query=%s',
    serviceId: 'facebook-messenger',
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    kind: 'builtin',
    templateUrl: 'https://www.instagram.com/explore/search/keyword/?q=%s',
    serviceId: 'instagram',
  },
  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    kind: 'builtin',
    templateUrl: 'https://www.linkedin.com/search/results/all/?keywords=%s',
    serviceId: 'linkedin',
  },
  pinterest: {
    id: 'pinterest',
    name: 'Pinterest',
    kind: 'builtin',
    templateUrl: 'https://www.pinterest.com/search/pins/?q=%s',
    serviceId: 'pinterest',
  },
  reddit: {
    id: 'reddit',
    name: 'Reddit',
    kind: 'builtin',
    templateUrl: 'https://www.reddit.com/search/?q=%s',
    serviceId: 'reddit',
  },
  threads: {
    id: 'threads',
    name: 'Threads',
    kind: 'builtin',
    templateUrl: 'https://www.threads.com/search?q=%s',
    serviceId: 'threads',
  },
  tiktok: {
    id: 'tiktok',
    name: 'TikTok',
    kind: 'builtin',
    templateUrl: 'https://www.tiktok.com/search?q=%s',
    serviceId: 'tiktok',
  },
  tumblr: {
    id: 'tumblr',
    name: 'Tumblr',
    kind: 'builtin',
    templateUrl: 'https://www.tumblr.com/search/%s',
    serviceId: 'tumblr',
  },
  vk: {
    id: 'vk',
    name: 'VK',
    kind: 'builtin',
    templateUrl: 'https://vk.com/search?c%5Bq%5D=%s',
    serviceId: 'vk',
  },
  x: {
    id: 'x',
    name: 'X',
    kind: 'builtin',
    templateUrl: 'https://x.com/search?q=%s',
    serviceId: 'x',
  },
}

export const builtinSearchProviderIds = Object.keys(builtinSearchProviders) as BuiltinSearchProviderId[]
export const searchSettingsProviderIds = builtinSearchProviderIds.filter(
  (id) => id !== 'url' && id !== 'facebook-messenger',
)

export function isValidSearchTemplate(templateUrl: string) {
  if (!templateUrl.includes('%s')) {
    return false
  }

  try {
    const parsed = new URL(templateUrl.replaceAll('%s', encodedPlaceholder))
    return ['http:', 'https:'].includes(parsed.protocol)
  } catch {
    return false
  }
}

export function getFaviconUrl(templateUrl: string) {
  if (!isValidSearchTemplate(templateUrl)) {
    return undefined
  }

  try {
    const parsed = new URL(templateUrl.replaceAll('%s', encodedPlaceholder))
    return `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(parsed.origin)}&sz=64`
  } catch {
    return undefined
  }
}

export function normalizeCustomSearchProvider(provider: Partial<CustomSearchProvider> | null | undefined) {
  const name = provider?.name?.trim()
  const templateUrl = provider?.templateUrl?.trim()
  if (!provider?.id || !name || !templateUrl || !isValidSearchTemplate(templateUrl)) {
    return null
  }

  return {
    id: provider.id,
    name,
    templateUrl,
    iconUrl: getFaviconUrl(templateUrl),
  } satisfies CustomSearchProvider
}

export function normalizeCustomSearchProviders(providers?: (Partial<CustomSearchProvider> | null | undefined)[]) {
  const next: CustomSearchProvider[] = []
  const seenIds = new Set<string>()
  for (const provider of providers || []) {
    const normalized = normalizeCustomSearchProvider(provider)
    if (!normalized || seenIds.has(normalized.id)) {
      continue
    }
    seenIds.add(normalized.id)
    next.push(normalized)
  }
  return next
}

export function normalizeEnabledSearchProviderIds(
  enabledIds: string[] | undefined,
  customProviders: CustomSearchProvider[],
) {
  const validIds = new Set<string>([...builtinSearchProviderIds, ...customProviders.map((provider) => provider.id)])
  const source = enabledIds?.length ? enabledIds : [...defaultEnabledSearchProviderIds]
  const next = ['url', ...source.filter((id) => id !== 'url' && validIds.has(id))]
  return Array.from(new Set(next))
}

export function normalizeSelectedSearchProviderId(selectedId: string | undefined, enabledIds: string[]) {
  if (!selectedId || !enabledIds.includes(selectedId)) {
    return 'url'
  }
  return selectedId
}

export function getResolvedSearchProvider(providerId: string, customProviders: CustomSearchProvider[]) {
  const builtin = builtinSearchProviders[providerId as BuiltinSearchProviderId]
  if (builtin) {
    return builtin satisfies ResolvedSearchProvider
  }

  const custom = customProviders.find((provider) => provider.id === providerId)
  if (!custom) {
    return null
  }

  return {
    id: custom.id,
    name: custom.name,
    kind: 'custom',
    templateUrl: custom.templateUrl,
    iconUrl: custom.iconUrl,
  } satisfies ResolvedSearchProvider
}

export function getEnabledSearchProviders(enabledIds: string[], customProviders: CustomSearchProvider[]) {
  const providers: ResolvedSearchProvider[] = []
  for (const id of enabledIds) {
    if (id === 'facebook-messenger') {
      continue
    }
    const provider = getResolvedSearchProvider(id, customProviders)
    if (provider) {
      providers.push(provider)
    }
  }
  return providers
}

export function resolveSearchUrl(providerId: string, input: string, customProviders: CustomSearchProvider[]) {
  const provider = getResolvedSearchProvider(providerId, customProviders)
  if (!provider?.templateUrl) {
    return null
  }

  const query = input.trim()
  if (!query) {
    return null
  }

  return provider.templateUrl.replaceAll('%s', encodeURIComponent(query))
}

export function resolveUrlInput(input: string) {
  const value = input.trim()
  if (!value) {
    return null
  }

  if (value.includes('://')) {
    return value
  }

  return `https://${value}`
}
