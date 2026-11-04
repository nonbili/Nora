import NoraViewModule from '@/modules/nora-view/src/NoraViewModule'
import { settings$ } from '@/states/settings'

let nextId = 1
const abortError = () => new DOMException('The operation was aborted.', 'AbortError')

/** Feed pages and JSON use a native session with the current proxy and no shared cookies. */
export const watchFetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
  const { signal } = init
  if (signal?.aborted) throw abortError()
  // Older native builds can still fetch directly when no proxy was requested.
  if (!NoraViewModule.watchFetch) {
    if (settings$.proxyEnabled.peek()) throw new Error('Proxy feed requests require an updated iOS build.')
    return fetch(url, init)
  }
  const id = nextId++
  const onAbort = () => { void NoraViewModule.abortWatchFetch?.(id).catch(() => {}) }
  signal?.addEventListener('abort', onAbort)
  try {
    const headers: Record<string, string> = {}
    new Headers(init.headers).forEach((value, name) => { headers[name] = value })
    const settings = settings$.peek()
    const answer = await NoraViewModule.watchFetch(id, url, init.method ?? 'GET', headers,
      typeof init.body === 'string' ? init.body : null, {
        proxyEnabled: settings.proxyEnabled, proxyType: settings.proxyType,
        proxyHost: settings.proxyHost, proxyPort: settings.proxyPort,
        proxyUsername: settings.proxyUsername, proxyPassword: settings.proxyPassword,
      })
    if (signal?.aborted) throw abortError()
    // Like desktop's feed transport: text/JSON, final URL, and unfiltered response headers.
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      url: answer.url,
      headers: { get: (name: string) => answer.headers[name.toLowerCase()] ?? null },
      text: async () => answer.body,
      json: async () => JSON.parse(answer.body),
    } as unknown as Response
  } catch (error) {
    if (signal?.aborted) throw abortError()
    throw error
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}
