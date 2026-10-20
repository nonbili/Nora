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

export interface Snapshot {
  watch: Pick<ReturnType<(typeof import('@/states/watch'))['watch$']['peek']>, 'profiles' | 'timelines'>
  settings: Settings
  bookmarks: import('@/states/bookmarks').Bookmarks
  styles: import('@/lib/user-styles').UserStylesSnapshot
  meta: ReturnType<(typeof import('@/states/sync-meta'))['syncMeta$']['peek']>
}

export function localConfig() {
  const url = process.env.NORA_SYNC_URL
  const anonKey = process.env.NORA_SYNC_ANON_KEY
  const serviceKey = process.env.NORA_SYNC_SERVICE_ROLE_KEY
  if (!url || !anonKey || !serviceKey) throw new Error('Local sync tests require NORA_SYNC_URL, NORA_SYNC_ANON_KEY, and NORA_SYNC_SERVICE_ROLE_KEY')
  const parsed = new URL(url)
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)) {
    throw new Error('Local sync tests require a loopback HTTP Supabase URL')
  }
  return { url, anonKey, serviceKey }
}
