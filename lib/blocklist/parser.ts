import { ParsedFilterList } from './types'

const HOSTFILE_RE = /^(?:0\.0\.0\.0|127\.0\.0\.1|::1)\s+([^\s#]+)$/i
const COSMETIC_TOKENS = ['##', '#@#', '#$#', '#?#', '#%#']
const INVALID_RULE_TOKENS = ['*', '?', '/', '=', ',', '~']
const HOST_LABEL_RE = /^[a-z0-9-]+$/i
const UNSUPPORTED_COSMETIC_SELECTOR_TOKENS = [
  '+js(',
  ':has-text(',
  ':-abp-',
  ':contains(',
  ':matches-css',
  ':remove(',
  ':style(',
  ':upward(',
  ':xpath(',
]

export const DEFAULT_BLOCKLIST_EXPIRY_MS = 4 * 24 * 60 * 60 * 1000
const PARSE_YIELD_EVERY = 4_000

const yieldToMainThread = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

function normalizeHost(host: string): string | null {
  'worklet'
  const trimmed = host.trim().replace(/^\.+|\.+$/g, '').toLowerCase()
  if (!trimmed || trimmed.includes(':')) {
    return null
  }
  if (INVALID_RULE_TOKENS.some((token) => trimmed.includes(token))) {
    return null
  }
  if (!trimmed.includes('.') || trimmed.length > 253) {
    return null
  }

  const labels = trimmed.split('.')
  for (const label of labels) {
    if (!label || label.length > 63) {
      return null
    }
    if (label.startsWith('-') || label.endsWith('-')) {
      return null
    }
    if (!HOST_LABEL_RE.test(label)) {
      return null
    }
  }

  return trimmed
}

function extractHost(rawLine: string) {
  'worklet'
  let line = rawLine.trim()
  if (!line || line.startsWith('!') || line.startsWith('[')) {
    return null
  }
  if (COSMETIC_TOKENS.some((token) => line.includes(token))) {
    return null
  }

  const allow = line.startsWith('@@')
  if (allow) {
    line = line.slice(2)
  }

  const optionIndex = line.indexOf('$')
  if (optionIndex !== -1) {
    const pattern = line.slice(0, optionIndex)
    if (!pattern.startsWith('||') || !pattern.endsWith('^')) {
      return null
    }
    line = pattern
  }

  const hostfileMatch = line.match(HOSTFILE_RE)
  if (hostfileMatch) {
    const host = normalizeHost(hostfileMatch[1] || '')
    return host ? { host, allow } : null
  }

  if (line.startsWith('||')) {
    const anchored = line.slice(2)
    if (!anchored.endsWith('^')) {
      return null
    }
    const host = normalizeHost(anchored.slice(0, -1))
    return host ? { host, allow } : null
  }

  const host = normalizeHost(line)
  return host ? { host, allow } : null
}

function addHostEntry(rawLine: string, blockedHosts: Set<string>, allowedHosts: Set<string>) {
  'worklet'
  const entry = extractHost(rawLine)
  if (!entry) {
    return
  }
  if (entry.allow) {
    allowedHosts.add(entry.host)
  } else {
    blockedHosts.add(entry.host)
  }
}

function extractCosmeticFilter(rawLine: string) {
  'worklet'
  let line = rawLine.trim()
  if (!line || line.startsWith('!') || line.startsWith('[')) {
    return null
  }

  let separator = '##'
  let separatorIndex = line.indexOf(separator)
  const exceptionIndex = line.indexOf('#@#')
  if (exceptionIndex !== -1 && (separatorIndex === -1 || exceptionIndex < separatorIndex)) {
    separator = '#@#'
    separatorIndex = exceptionIndex
  }
  if (separatorIndex === -1) {
    return null
  }
  if (line.includes('#?#') || line.includes('#$#') || line.includes('#%#')) {
    return null
  }

  const domains = line.slice(0, separatorIndex).trim()
  const selector = line.slice(separatorIndex + separator.length).trim()
  if (!selector || UNSUPPORTED_COSMETIC_SELECTOR_TOKENS.some((token) => selector.includes(token))) {
    return null
  }

  return `${domains}${separator}${selector}`
}

function addCosmeticEntry(rawLine: string, cosmeticFilters: Set<string>, cosmeticExceptions: Set<string>) {
  'worklet'
  const entry = extractCosmeticFilter(rawLine)
  if (!entry) {
    return
  }
  if (entry.includes('#@#')) {
    cosmeticExceptions.add(entry)
  } else {
    cosmeticFilters.add(entry)
  }
}

function finalizeHosts(
  blockedHosts: Set<string>,
  allowedHosts: Set<string>,
  cosmeticFilters: Set<string> = new Set(),
  cosmeticExceptions: Set<string> = new Set(),
  sort = true,
) {
  'worklet'
  const nextBlockedHosts = Array.from(blockedHosts)
  const nextAllowedHosts = Array.from(allowedHosts)
  const nextCosmeticFilters = Array.from(cosmeticFilters)
  const nextCosmeticExceptions = Array.from(cosmeticExceptions)
  if (sort) {
    nextBlockedHosts.sort()
    nextAllowedHosts.sort()
    nextCosmeticFilters.sort()
    nextCosmeticExceptions.sort()
  }

  return {
    blockedHosts: nextBlockedHosts,
    allowedHosts: nextAllowedHosts,
    cosmeticFilters: nextCosmeticFilters,
    cosmeticExceptions: nextCosmeticExceptions,
  }
}

function finalizeHostText(
  blockedHosts: Set<string>,
  allowedHosts: Set<string>,
  cosmeticFilters: Set<string> = new Set(),
  cosmeticExceptions: Set<string> = new Set(),
  sort = true,
) {
  'worklet'
  const finalized = finalizeHosts(blockedHosts, allowedHosts, cosmeticFilters, cosmeticExceptions, sort)
  return {
    blockedHosts: finalized.blockedHosts.join('\n'),
    allowedHosts: finalized.allowedHosts.join('\n'),
    cosmeticFilters: finalized.cosmeticFilters.join('\n'),
    cosmeticExceptions: finalized.cosmeticExceptions.join('\n'),
  }
}

export function getAdvertisedExpiryMs(text: string) {
  'worklet'
  const match = text.match(/^!\s*Expires:\s*(\d+)\s*(hour|hours|day|days)\b/im)
  if (!match) {
    return DEFAULT_BLOCKLIST_EXPIRY_MS
  }
  const amount = Number(match[1])
  const unit = match[2]?.toLowerCase()
  if (!Number.isFinite(amount) || amount <= 0) {
    return DEFAULT_BLOCKLIST_EXPIRY_MS
  }
  const multiplier = unit?.startsWith('hour') ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000
  return amount * multiplier
}

export function parseFilterList(text: string): ParsedFilterList {
  'worklet'
  const blockedHosts = new Set<string>()
  const allowedHosts = new Set<string>()
  const cosmeticFilters = new Set<string>()
  const cosmeticExceptions = new Set<string>()

  for (const rawLine of text.split(/\r?\n/)) {
    addHostEntry(rawLine, blockedHosts, allowedHosts)
    addCosmeticEntry(rawLine, cosmeticFilters, cosmeticExceptions)
  }

  return {
    ...finalizeHosts(blockedHosts, allowedHosts, cosmeticFilters, cosmeticExceptions, true),
    expiresInMs: getAdvertisedExpiryMs(text),
  }
}

function collectHosts(
  text: string,
  blockedHosts: Set<string>,
  allowedHosts: Set<string>,
  cosmeticFilters: Set<string>,
  cosmeticExceptions: Set<string>,
) {
  'worklet'
  let lineStart = 0

  for (let index = 0; index <= text.length; index += 1) {
    const charCode = text.charCodeAt(index)
    const isEnd = index === text.length
    const isNewline = charCode === 10 || charCode === 13
    if (!isEnd && !isNewline) {
      continue
    }

    addHostEntry(text.slice(lineStart, index), blockedHosts, allowedHosts)
    addCosmeticEntry(text.slice(lineStart, index), cosmeticFilters, cosmeticExceptions)

    if (charCode === 13 && text.charCodeAt(index + 1) === 10) {
      index += 1
    }
    lineStart = index + 1
  }
}

export function mergeFilterLists(texts: string[], { sort = false }: { sort?: boolean } = {}) {
  'worklet'
  const blockedHosts = new Set<string>()
  const allowedHosts = new Set<string>()
  const cosmeticFilters = new Set<string>()
  const cosmeticExceptions = new Set<string>()

  for (const text of texts) {
    collectHosts(text, blockedHosts, allowedHosts, cosmeticFilters, cosmeticExceptions)
  }

  return finalizeHosts(blockedHosts, allowedHosts, cosmeticFilters, cosmeticExceptions, sort)
}

export function mergeFilterListsText(texts: string[], { sort = false }: { sort?: boolean } = {}) {
  'worklet'
  const blockedHosts = new Set<string>()
  const allowedHosts = new Set<string>()
  const cosmeticFilters = new Set<string>()
  const cosmeticExceptions = new Set<string>()

  for (const text of texts) {
    collectHosts(text, blockedHosts, allowedHosts, cosmeticFilters, cosmeticExceptions)
  }

  return finalizeHostText(blockedHosts, allowedHosts, cosmeticFilters, cosmeticExceptions, sort)
}

async function collectHostsAsync(
  text: string,
  blockedHosts: Set<string>,
  allowedHosts: Set<string>,
  cosmeticFilters: Set<string>,
  cosmeticExceptions: Set<string>,
) {
  let lineStart = 0
  let linesSinceYield = 0

  for (let index = 0; index <= text.length; index += 1) {
    const charCode = text.charCodeAt(index)
    const isEnd = index === text.length
    const isNewline = charCode === 10 || charCode === 13
    if (!isEnd && !isNewline) {
      continue
    }

    const line = text.slice(lineStart, index)
    addHostEntry(line, blockedHosts, allowedHosts)
    addCosmeticEntry(line, cosmeticFilters, cosmeticExceptions)

    if (charCode === 13 && text.charCodeAt(index + 1) === 10) {
      index += 1
    }
    lineStart = index + 1
    linesSinceYield += 1

    if (linesSinceYield >= PARSE_YIELD_EVERY) {
      linesSinceYield = 0
      await yieldToMainThread()
    }
  }
}

export async function mergeFilterListsAsync(texts: string[], { sort = false }: { sort?: boolean } = {}) {
  const blockedHosts = new Set<string>()
  const allowedHosts = new Set<string>()
  const cosmeticFilters = new Set<string>()
  const cosmeticExceptions = new Set<string>()

  for (const text of texts) {
    await collectHostsAsync(text, blockedHosts, allowedHosts, cosmeticFilters, cosmeticExceptions)
  }

  return finalizeHosts(blockedHosts, allowedHosts, cosmeticFilters, cosmeticExceptions, sort)
}

export function hostCandidates(host: string) {
  'worklet'
  const normalized = normalizeHost(host)
  if (!normalized) {
    return []
  }
  const parts = normalized.split('.')
  return parts.map((_, index) => parts.slice(index).join('.'))
}

export function shouldBlockHost(host: string, blockedHosts: Set<string>, allowedHosts: Set<string>) {
  'worklet'
  const candidates = hostCandidates(host)
  if (!candidates.length) {
    return false
  }

  const blockIndex = candidates.findIndex((candidate) => blockedHosts.has(candidate))
  if (blockIndex === -1) {
    return false
  }

  const allowIndex = candidates.findIndex((candidate) => allowedHosts.has(candidate))
  if (allowIndex === -1) {
    return true
  }

  return allowIndex > blockIndex
}

export function hostSpecificity(host: string) {
  'worklet'
  return host.split('.').length
}
