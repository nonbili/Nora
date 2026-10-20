// Each device has its own process, observables, sync metadata, MMKV, and SQLite.
// Only the platform runtime and client wiring are replaced; queries hit Supabase.
import '../setup'
import { mock } from 'bun:test'
import { createClient } from '@supabase/supabase-js'
import { localConfig, type Command } from './protocol'

const { url, anonKey } = localConfig()
let failTable: string | undefined
const feedRequests: string[] = []
const client = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: {
    fetch: Object.assign((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const requestUrl = new URL(input instanceof Request ? input.url : String(input))
      if ((!init?.method || init.method === 'GET') && requestUrl.pathname === '/rest/v1/feed_sources') {
        feedRequests.push(requestUrl.href)
      }
      if (failTable && init?.method === 'POST' && requestUrl.pathname === `/rest/v1/${failTable}`) {
        failTable = undefined
        return Promise.resolve(new Response(JSON.stringify({ message: 'Injected push failure', code: 'TEST_FAILURE' }), {
          status: 403, headers: { 'Content-Type': 'application/json' },
        }))
      }
      return fetch(input, init)
    }, { preconnect: fetch.preconnect }),
  },
})
mock.module('@/lib/supabase/client', () => ({ supabase: client.schema('nora'), supabaseAuth: client.auth }))

const { auth$ } = await import('@/states/auth')
const { watch$ } = await import('@/states/watch')
const { settings$ } = await import('@/states/settings')
const { bookmarks$ } = await import('@/states/bookmarks')
const { userStyles$, getUserStylesSnapshot } = await import('@/states/user-styles')
const { syncMeta$ } = await import('@/states/sync-meta')
const { syncSupabase } = await import('@/lib/supabase/sync')
const { feedsSyncer } = await import('@/lib/supabase/sync/feeds')
const { settingsSyncer } = await import('@/lib/supabase/sync/settings')
const { bookmarksSyncer } = await import('@/lib/supabase/sync/bookmarks')
const { userStylesSyncer } = await import('@/lib/supabase/sync/user-styles')

const { error } = await client.auth.signInWithPassword({
  email: process.env.NORA_SYNC_EMAIL!, password: process.env.NORA_SYNC_PASSWORD!,
})
if (error) throw error
auth$.plan.set('sync')

const syncers = { feeds: feedsSyncer, settings: settingsSyncer, bookmarks: bookmarksSyncer, userStyles: userStylesSyncer }
async function execute(command: Command) {
  switch (command.op) {
    case 'snapshot': return JSON.parse(JSON.stringify({
      watch: { profiles: watch$.profiles.peek(), timelines: watch$.timelines.peek() },
      settings: settings$.peek(), bookmarks: bookmarks$.peek(), styles: getUserStylesSnapshot(), meta: syncMeta$.peek(),
    }))
    case 'watch': watch$.watch({ site: command.site, handle: command.handle }); break
    case 'unwatch': watch$.unwatch(command.key); break
    case 'timeline': return watch$.createTimeline(command.name, command.keys)
    case 'renameTimeline': watch$.updateTimeline(command.id, { name: command.name }); break
    case 'deleteTimeline': watch$.deleteTimeline(command.id); break
    case 'profile': watch$.updateProfile(command.key, command.patch); break
    case 'settings': settings$.assign(command.value); break
    case 'bookmark': bookmarks$.addBookmark({ url: command.url }); break
    case 'style': userStyles$.setBuiltinEnabled('hide-x-home-tabs', command.enabled); break
    case 'failNextPush': failTable = command.table; break
    case 'takeFeedRequests': return feedRequests.splice(0)
    case 'sync':
      if (command.scope) await syncers[command.scope].syncNow()
      else await syncSupabase()
      break
  }
  return null
}

process.on('message', async (message: { id: number; command: Command }) => {
  try {
    process.send?.({ id: message.id, value: await execute(message.command) })
  } catch (error) {
    process.send?.({ id: message.id, error: error instanceof Error ? error.message : String(error) })
  }
})
process.send?.({ ready: true })
