export const BLOCKLIST_SOURCE_IDS = [
  'easylist',
  'easyprivacy',
  'braveFirstparty',
  'braveFirstpartyRegional',
] as const

export type BlocklistSourceId = (typeof BLOCKLIST_SOURCE_IDS)[number]

export type BlocklistPhase = 'idle' | 'fetching' | 'ready' | 'error'

export interface BlocklistSourceCache {
  url: string
  etag?: string
  lastModified?: string
  lastFetchedAt?: number
}

export interface BlocklistSnapshot {
  enabled: boolean
  phase: BlocklistPhase
  hasSnapshot: boolean
  lastUpdatedAt?: number
  lastError?: string
  revision: number
  schemaVersion: number
  sources: Record<BlocklistSourceId, BlocklistSourceCache>
}

export interface ParsedFilterList {
  blockedHosts: string[]
  allowedHosts: string[]
  cosmeticFilters: string[]
  cosmeticExceptions: string[]
  expiresInMs: number
}

export interface BlocklistMatcherData {
  enabled: boolean
  blockedHosts: string[]
  allowedHosts: string[]
  cosmeticFilters: string[]
  cosmeticExceptions: string[]
  revision: number
}

export interface PersistedBlocklistMatcherSnapshot {
  revision: number
  blockedHosts: string
  allowedHosts: string
  cosmeticFilters?: string
  cosmeticExceptions?: string
}

export interface BlocklistPayload {
  enabled: boolean
  blockedHosts: string
  allowedHosts: string
  cosmeticFilters?: string
  cosmeticExceptions?: string
  revision: number
}

export interface DesktopBlocklistPayload extends BlocklistPayload {
  partitions: string[]
}

export interface RemoteTextResponse {
  status: number
  body: string
  headers: Record<string, string | undefined>
}

export interface BlocklistFetchSourceResult {
  id: BlocklistSourceId
  status: number
  body?: string
  etag?: string
  lastModified?: string
  lastFetchedAt: number
}
