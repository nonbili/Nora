import { nanoid } from 'nanoid'

export const USER_STYLES_SCHEMA_VERSION = 1

export const builtinUserStyleIds = [
  'hide-reddit-game',
  'compact-tiktok-layout',
  'hide-x-bottom-nav',
  'hide-x-home-tabs',
] as const

export type BuiltinUserStyleId = (typeof builtinUserStyleIds)[number]

export interface BuiltinUserStyleState {
  enabled: boolean
}

export interface CustomUserStyle {
  id: string
  name: string
  enabled: boolean
  hostGlobs: string[]
  css: string
}

export interface CustomUserScript {
  id: string
  name: string
  enabled: boolean
  hostGlobs: string[]
  js: string
}

export interface UserStylesSnapshot {
  schemaVersion: number
  builtins: Record<BuiltinUserStyleId, BuiltinUserStyleState>
  customStyles: CustomUserStyle[]
  customScripts: CustomUserScript[]
}

export interface BuiltinUserStyleDefinition {
  id: BuiltinUserStyleId
  labelKey: string
  hostGlobs: string[]
  css: string
}

const css = (raw: ArrayLike<string>, ...values: any[]) => String.raw({ raw }, ...values)

export const builtinUserStyleDefinitions: BuiltinUserStyleDefinition[] = [
  {
    id: 'hide-reddit-game',
    labelKey: 'settings.userStyles.builtin.hideRedditGame.label',
    hostGlobs: ['www.reddit.com'],
    css: css`
      /* GAME */
      article:has([slot='ssr-post-content-header']) {
        display: none !important;
      }
    `,
  },
  {
    id: 'compact-tiktok-layout',
    labelKey: 'settings.userStyles.builtin.compactTiktokLayout.label',
    hostGlobs: ['www.tiktok.com'],
    css: css`
      /* Compact sidebar */
      div[class*='DivSideNavPlaceholderContainer'] {
        width: 4rem !important;
      }

      div[class*='DivSideNavContainer'] {
        width: 4rem !important;
      }

      main#main-content-homepage_hot {
        min-width: 0 !important;
      }

      div[class*='DivColumnListContainer'] {
        padding-inline-end: 0 !important;
      }

      section[class*='SectionMediaCardContainer'] {
        width: calc(100vw - 4rem);
        min-width: 0;
      }

      /* Videos|Favorites|Liked tabs */
      .css-1vk63hd-7937d88b--DivVideoFeedTab.ej9r3wt0 p {
        padding-left: 1rem !important;
        padding-right: 1rem !important;
      }
    `,
  },
  {
    id: 'hide-x-bottom-nav',
    labelKey: 'settings.userStyles.builtin.hideXBottomNav.label',
    hostGlobs: ['x.com'],
    css: css`
      /* Bottom nav bar */
      [style*='opacity: 0.3'] {
        display: none !important;
      }
    `,
  },
  {
    id: 'hide-x-home-tabs',
    labelKey: 'settings.userStyles.builtin.hideXHomeTabs.label',
    hostGlobs: ['x.com'],
    css: css`
      /* Home timeline tabs wrapper */
      [role='tablist']:has(
        [role='tab'][aria-label*='For you'],
        [role='tab'][data-testid*='For you'],
        [role='tab'][aria-label*='Following'],
        [role='tab'][data-testid*='Following']
      ),
      [role='tablist']:has(
        [role='tab'][aria-label*='for you'],
        [role='tab'][data-testid*='for you'],
        [role='tab'][aria-label*='following'],
        [role='tab'][data-testid*='following']
      ) {
        display: none !important;
      }

      [role='tablist']:has(
          [role='tab'][aria-label*='For you'],
          [role='tab'][data-testid*='For you'],
          [role='tab'][aria-label*='Following'],
          [role='tab'][data-testid*='Following']
        )
        > *,
      [role='tablist']:has(
          [role='tab'][aria-label*='for you'],
          [role='tab'][data-testid*='for you'],
          [role='tab'][aria-label*='following'],
          [role='tab'][data-testid*='following']
        )
        > * {
        display: none !important;
      }
    `,
  },
]

export const builtinUserStyleDefinitionById = builtinUserStyleDefinitions.reduce(
  (acc, definition) => {
    acc[definition.id] = definition
    return acc
  },
  {} as Record<BuiltinUserStyleId, BuiltinUserStyleDefinition>,
)

export const createDefaultBuiltinUserStyles = (): Record<BuiltinUserStyleId, BuiltinUserStyleState> => ({
  'hide-reddit-game': { enabled: false },
  'compact-tiktok-layout': { enabled: true },
  'hide-x-bottom-nav': { enabled: true },
  'hide-x-home-tabs': { enabled: false },
})

export const createDefaultUserStylesSnapshot = (): UserStylesSnapshot => ({
  schemaVersion: USER_STYLES_SCHEMA_VERSION,
  builtins: createDefaultBuiltinUserStyles(),
  customStyles: [],
  customScripts: [],
})

export const normalizeHostGlob = (value: string) => {
  const normalized = value.trim().toLowerCase()
  if (!normalized || normalized.includes('://') || normalized.includes('/') || /\s/.test(normalized)) {
    return ''
  }
  if (!/^[a-z0-9.*-]+$/.test(normalized)) {
    return ''
  }
  return normalized
}

export const sanitizeHostGlobs = (values?: string[]) => {
  const seen = new Set<string>()
  const result: string[] = []

  for (const value of values || []) {
    const normalized = normalizeHostGlob(value)
    if (!normalized || seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    result.push(normalized)
  }

  return result
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const matchesHostGlob = (host: string, glob: string) => {
  const normalizedHost = host.trim().toLowerCase()
  const normalizedGlob = normalizeHostGlob(glob)
  if (!normalizedHost || !normalizedGlob) {
    return false
  }
  const pattern = `^${escapeRegExp(normalizedGlob).replace(/\\\*/g, '.*')}$`
  return new RegExp(pattern, 'i').test(normalizedHost)
}

export const matchesAnyHostGlob = (host: string, hostGlobs: string[]) => {
  return hostGlobs.some((glob) => matchesHostGlob(host, glob))
}

export const getEnabledUserStyleCss = (host: string, snapshot?: UserStylesSnapshot) => {
  const normalizedHost = host.trim().toLowerCase()
  const userStyles = snapshot || createDefaultUserStylesSnapshot()
  const builtinCss = builtinUserStyleDefinitions
    .filter((definition) => userStyles.builtins[definition.id]?.enabled !== false)
    .filter((definition) => matchesAnyHostGlob(normalizedHost, definition.hostGlobs))
    .map((definition) => definition.css.trim())
    .filter(Boolean)

  const customCss = (userStyles.customStyles || [])
    .filter((style) => style.enabled)
    .filter((style) => style.css.trim())
    .filter((style) => matchesAnyHostGlob(normalizedHost, style.hostGlobs))
    .map((style) => style.css.trim())
    .filter(Boolean)

  return [...builtinCss, ...customCss].join('\n\n')
}

export const getEnabledUserScripts = (host: string, snapshot?: UserStylesSnapshot) => {
  const normalizedHost = host.trim().toLowerCase()
  const userStyles = snapshot || createDefaultUserStylesSnapshot()

  return (userStyles.customScripts || [])
    .filter((script) => script.enabled)
    .filter((script) => script.js.trim())
    .filter((script) => matchesAnyHostGlob(normalizedHost, script.hostGlobs))
    .map((script) => ({
      ...script,
      js: script.js.trim(),
    }))
}

const genId = (size = 6) => nanoid(size)

const normalizeCustomUserStyle = (
  style: Partial<CustomUserStyle> | null | undefined,
  index: number,
): CustomUserStyle | null => {
  if (!style) {
    return null
  }

  const hostGlobs = sanitizeHostGlobs(style.hostGlobs)
  const css = typeof style.css === 'string' ? style.css.replace(/\s+$/, '') : ''
  if (!hostGlobs.length || !css.trim()) {
    return null
  }

  const name = typeof style.name === 'string' && style.name.trim() ? style.name.trim() : `Style ${index + 1}`

  return {
    id: typeof style.id === 'string' && style.id ? style.id : genId(),
    name,
    enabled: typeof style.enabled === 'boolean' ? style.enabled : true,
    hostGlobs,
    css,
  }
}

const normalizeCustomUserScript = (
  script: Partial<CustomUserScript> | null | undefined,
  index: number,
): CustomUserScript | null => {
  if (!script) {
    return null
  }

  const hostGlobs = sanitizeHostGlobs(script.hostGlobs)
  const js = typeof script.js === 'string' ? script.js.replace(/\s+$/, '') : ''
  if (!hostGlobs.length || !js.trim()) {
    return null
  }

  const name = typeof script.name === 'string' && script.name.trim() ? script.name.trim() : `Script ${index + 1}`

  return {
    id: typeof script.id === 'string' && script.id ? script.id : genId(),
    name,
    enabled: typeof script.enabled === 'boolean' ? script.enabled : true,
    hostGlobs,
    js,
  }
}

const metadataBlockPattern = /\/\/\s*==UserScript==([\s\S]*?)\/\/\s*==\/UserScript==/

const parseMetadataLine = (line: string) => {
  const match = line.match(/^\s*\/\/\s*@(\S+)\s+(.+?)\s*$/)
  if (!match) {
    return null
  }
  return {
    key: match[1],
    value: match[2],
  }
}

const hostGlobFromUrlPattern = (pattern: string) => {
  const trimmed = pattern.trim()
  if (!trimmed || trimmed === '*') {
    return ''
  }

  const withProtocol = trimmed.includes('://') ? trimmed : `https://${trimmed}`
  try {
    const url = new URL(withProtocol.replace(/\\\*/g, '*'))
    return normalizeHostGlob(url.hostname)
  } catch {
    const host = trimmed
      .replace(/^[a-z*]+:\/\//i, '')
      .split('/')[0]
      .split(':')[0]
    return normalizeHostGlob(host)
  }
}

export const parseUserscriptMetadata = (source: string) => {
  const block = source.match(metadataBlockPattern)?.[1]
  if (!block) {
    return {
      name: '',
      hostGlobs: [] as string[],
    }
  }

  const hostPatterns: string[] = []
  let name = ''

  for (const line of block.split('\n')) {
    const parsed = parseMetadataLine(line)
    if (!parsed) {
      continue
    }
    if (parsed.key === 'name' && !name) {
      name = parsed.value.trim()
    }
    if (parsed.key === 'match' || parsed.key === 'include') {
      hostPatterns.push(parsed.value)
    }
  }

  return {
    name,
    hostGlobs: sanitizeHostGlobs(hostPatterns.map(hostGlobFromUrlPattern)),
  }
}

export const stripUserscriptMetadata = (source: string) => {
  return source.replace(metadataBlockPattern, '').replace(/^\s+/, '').replace(/\s+$/, '')
}

export const normalizeUserStyles = (data?: Partial<UserStylesSnapshot>): UserStylesSnapshot => {
  const defaults = createDefaultUserStylesSnapshot()
  const builtins = createDefaultBuiltinUserStyles()

  for (const id of builtinUserStyleIds) {
    builtins[id] = {
      enabled:
        typeof data?.builtins?.[id]?.enabled === 'boolean' ? data.builtins[id].enabled : defaults.builtins[id].enabled,
    }
  }

  const customStyles = (data?.customStyles || [])
    .map((style, index) => normalizeCustomUserStyle(style, index))
    .filter((style): style is CustomUserStyle => style != null)

  const customScripts = (data?.customScripts || [])
    .map((script, index) => normalizeCustomUserScript(script, index))
    .filter((script): script is CustomUserScript => script != null)

  return {
    schemaVersion: USER_STYLES_SCHEMA_VERSION,
    builtins,
    customStyles,
    customScripts,
  }
}

export const createNormalizedCustomUserStyle = (style: Partial<CustomUserStyle> | null | undefined, index: number) => {
  return normalizeCustomUserStyle(style, index)
}

export const createNormalizedCustomUserScript = (
  script: Partial<CustomUserScript> | null | undefined,
  index: number,
) => {
  return normalizeCustomUserScript(script, index)
}
