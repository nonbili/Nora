import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Settings } from '@/states/settings'
import type { WatchedProfile } from '@/states/watch'
import type { WatchSite } from '@/lib/watch'

export type Command =
  | { op: 'snapshot' }
  | { op: 'watch'; site: WatchSite; handle: string }
  | { op: 'unwatch'; key: string }
  | { op: 'timeline'; name: string; keys: string[] }
  | { op: 'renameTimeline'; id: string; name: string }
  | { op: 'deleteTimeline'; id: string }
  | { op: 'profile'; key: string; patch: Partial<WatchedProfile> }
  | { op: 'settings'; value: Partial<Settings> }
  | { op: 'bookmark'; url: string }
  | { op: 'style'; enabled: boolean }
  | { op: 'sync'; scope?: 'feeds' | 'settings' | 'bookmarks' | 'userStyles' }
  | { op: 'failNextPush'; table: string }
  | { op: 'takeFeedRequests' }
  | { op: 'signIn'; email: string; password: string }
  | { op: 'accountChoice'; choice: 'useAccount' | 'mergeDevice' }
  | { op: 'holdNextRequest'; path: string }
  | { op: 'deleteBookmark'; url: string }
  | { op: 'customScript'; name: string }
  | { op: 'restoreBackup'; scope: 'settings' | 'bookmarks' | 'userStyles' }
  | { op: 'forgetBase'; scope: 'settings' | 'bookmarks' | 'userStyles' }
  | { op: 'releaseFetch' }

export interface Snapshot {
  watch: Pick<ReturnType<(typeof import('@/states/watch'))['watch$']['peek']>, 'profiles' | 'timelines'>
  settings: Settings
  bookmarks: import('@/states/bookmarks').Bookmarks
  styles: import('@/lib/user-styles').UserStylesSnapshot
  meta: ReturnType<(typeof import('@/states/sync-meta'))['syncMeta$']['peek']>
  owner: ReturnType<(typeof import('@/states/sync-owner'))['syncOwner$']['peek']>
  userId?: string
  needsAccountChoice: boolean
}

// Written by `bun scripts/sync-stack.ts start` in Inks.
function stackConnection(): { url?: string; anonKey?: string; serviceKey?: string } {
  try {
    return JSON.parse(readFileSync(join(homedir(), '.inks-sync-stack.json'), 'utf8'))
  } catch {
    return {}
  }
}

export function localConfig() {
  const stack = stackConnection()
  const url = process.env.NORA_SYNC_URL ?? stack.url
  const anonKey = process.env.NORA_SYNC_ANON_KEY ?? stack.anonKey
  const serviceKey = process.env.NORA_SYNC_SERVICE_ROLE_KEY ?? stack.serviceKey
  if (!url || !anonKey || !serviceKey) throw new Error('Local sync tests need a stack: run `bun scripts/sync-stack.ts start` in Inks, or set NORA_SYNC_URL, NORA_SYNC_ANON_KEY, and NORA_SYNC_SERVICE_ROLE_KEY')
  const parsed = new URL(url)
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) {
    throw new Error('Local sync tests require a loopback HTTP Supabase URL')
  }
  return { url, anonKey, serviceKey }
}
