import { afterEach, describe, expect, it, mock } from 'bun:test'
import { settings$ } from '@/states/settings'
import type NativeModule from '@/modules/nora-view/src/NoraViewModule'
const NoraViewModule = {} as typeof NativeModule
mock.module('@/modules/nora-view/src/NoraViewModule', () => ({ default: NoraViewModule }))
const { watchFetch } = await import('./watch-fetch.ios')

const originalFetch = NoraViewModule.watchFetch
const originalAbort = NoraViewModule.abortWatchFetch
const originalGlobalFetch = globalThis.fetch
const originalSettings = settings$.peek()
afterEach(() => {
  NoraViewModule.watchFetch = originalFetch
  NoraViewModule.abortWatchFetch = originalAbort
  globalThis.fetch = originalGlobalFetch
  settings$.assign(originalSettings)
})
const answer = { status: 200, url: 'https://feed.example/final', headers: { 'content-type': 'application/json' }, body: '{"ok":true}' }

describe('iOS feed transport', () => {
  it('passes device credentials before any UI synchronization and exposes feed responses', async () => {
    settings$.assign({ proxyEnabled: true, proxyType: 'socks', proxyHost: 'localhost', proxyPort: '1080', proxyUsername: 'local user', proxyPassword: 'local password' })
    const native = mock(async () => answer)
    NoraViewModule.watchFetch = native
    const response = await watchFetch('https://feed.example', { headers: { Accept: 'application/json' } })
    expect(native.mock.calls[0].slice(1)).toEqual(['https://feed.example', 'GET', { accept: 'application/json' }, null, {
      proxyEnabled: true, proxyType: 'socks', proxyHost: 'localhost', proxyPort: '1080', proxyUsername: 'local user', proxyPassword: 'local password',
    }])
    expect(await response.json()).toEqual({ ok: true })
    expect(response.url).toBe(answer.url)
    expect(response.headers.get('Content-Type')).toBe('application/json')
  })

  it('uses independent request IDs after a JS runtime reload', async () => {
    const ids: string[] = []
    NoraViewModule.watchFetch = mock(async (id: string) => { ids.push(id); return answer })
    const runtimePath = './watch-fetch.ios.ts?second-runtime'
    const otherRuntime = await import(runtimePath)
    await Promise.all([watchFetch('https://feed.example'), otherRuntime.watchFetch('https://feed.example')])
    expect(ids).toHaveLength(2)
    expect(ids[0]).not.toBe(ids[1])
    expect(ids.every(id => typeof id === 'string' && id.length >= 21)).toBe(true)
  })

  it('cancels native work and rejects an aborted response', async () => {
    let finish!: (value: typeof answer) => void
    NoraViewModule.watchFetch = mock(() => new Promise(resolve => { finish = resolve }))
    const abort = mock(async () => {})
    NoraViewModule.abortWatchFetch = abort
    const controller = new AbortController()
    const request = watchFetch('https://feed.example', { signal: controller.signal })
    controller.abort()
    finish(answer)
    await expect(request).rejects.toHaveProperty('name', 'AbortError')
    expect(abort).toHaveBeenCalledTimes(1)
  })

  it('never falls back to direct traffic when an older native build lacks proxy transport', async () => {
    NoraViewModule.watchFetch = undefined
    const direct = mock(async () => new Response('direct'))
    globalThis.fetch = direct as typeof fetch
    settings$.proxyEnabled.set(true)
    await expect(watchFetch('https://feed.example')).rejects.toThrow('updated iOS build')
    expect(direct).not.toHaveBeenCalled()
    settings$.proxyEnabled.set(false)
    expect(await (await watchFetch('https://feed.example')).text()).toBe('direct')
  })
})
