import { afterEach, describe, expect, it } from 'bun:test'
import {
  IMGINN_PAGE_SELECTOR,
  TIKTOK_POSTS_MARKER,
  WATCH_WEBVIEW_CANCELLED,
  WATCH_WEBVIEW_CHALLENGE,
  WATCH_WEBVIEW_RATE_LIMITED,
  buildWatchPageScript,
  cancelWatchWebView,
  loadInWatchWebView,
  onWatchWebViewError,
  onWatchWebViewMessage,
  watchWebView$,
} from './watch-webview'

afterEach(() => {
  watchWebView$.hostMounted.set(false)
})

describe('buildWatchPageScript', () => {
  it('is a script that can run', () => {
    expect(() => new Function(buildWatchPageScript(7))).not.toThrow()
  })

  it('sends what it finds in the page with the id of its page', () => {
    const sent: string[] = []
    const scripts = [
      { textContent: '{"other":1}' },
      { textContent: '{"polaris_ordered_timeline_connection":{"edges":[]}}' },
    ]
    const document = {
      readyState: 'complete',
      querySelectorAll: (selector: string) => (selector.startsWith('meta') ? [{ outerHTML: '<meta property="og:title" content="x">' }] : scripts),
    }
    const window = { NoraI: { onMessage: (payload: string) => sent.push(payload) } } as any
    new Function('window', 'document', buildWatchPageScript(7))(window, document)
    expect(sent).toHaveLength(1)
    const message = JSON.parse(sent[0])
    expect(message.type).toBe('watch-page')
    expect(message.data.id).toBe(7)
    expect(message.data.html).toContain('<meta property="og:title" content="x">')
    expect(message.data.html).toContain('<script type="application/json">{"polaris_ordered_timeline_connection":{"edges":[]}}</script>')
  })
})

describe('buildWatchPageScript in a frame', () => {
  it('does nothing in a frame of the page, as it runs at the start of every document', () => {
    const sent: string[] = []
    const document = { readyState: 'complete', querySelectorAll: () => [] }
    const window = { top: {}, NoraI: { onMessage: (payload: string) => sent.push(payload) } } as any
    new Function('window', 'document', 'setTimeout', buildWatchPageScript(8))(window, document, () => {})
    expect(sent).toHaveLength(0)
    expect(window.__noraWatchStarted).toBeUndefined()
  })
})

describe('buildWatchPageScript with more', () => {
  it('keeps the answers the page loads as it is scrolled, and sends them all once no more come', () => {
    const sent: string[] = []
    const timers: (() => void)[] = []
    let scrolled = 0
    class FakeXHR {
      responseType = ''
      responseText = ''
      listeners: (() => void)[] = []
      addEventListener(_: string, listener: () => void) {
        this.listeners.push(listener)
      }
      send() {}
    }
    const document = {
      readyState: 'complete',
      scrollingElement: { scrollHeight: 5000 },
      querySelectorAll: (selector: string) => (selector.startsWith('meta') ? [] : [{ textContent: '{"post_id":"1"}' }]),
    }
    const window = {
      XMLHttpRequest: FakeXHR,
      NoraI: { onMessage: (payload: string) => sent.push(payload) },
      scrollTo: () => scrolled++,
    } as any
    new Function('window', 'document', 'XMLHttpRequest', 'setTimeout', buildWatchPageScript(3, '"post_id"', 10))(
      window,
      document,
      FakeXHR,
      (callback: () => void) => timers.push(callback),
    )
    // An answer of two documents, one of them with posts.
    const xhr = new FakeXHR()
    xhr.send()
    xhr.responseText = '{"data":{"other":1}}\n{"post_id":"2"}'
    xhr.listeners.forEach((listener) => listener.call(xhr))
    while (timers.length && !sent.length) timers.shift()!()
    expect(scrolled).toBeGreaterThan(0)
    expect(sent).toHaveLength(1)
    const { html } = JSON.parse(sent[0]).data
    expect(html).toContain('<script type="application/json">{"post_id":"1"}</script>')
    expect(html).toContain('<script type="application/json">{"post_id":"2"}</script>')
    expect(html).not.toContain('other')
  })
})

describe('buildWatchPageScript with fetch', () => {
  it('keeps the answers the page asks for with fetch, as TikTok does its posts, not its empty list in the page', async () => {
    const sent: string[] = []
    const timers: (() => void)[] = []
    const answer = (text: string) => ({ clone: () => ({ text: () => Promise.resolve(text) }) })
    const pageFetch = (url: string) => Promise.resolve(answer(url === '/api/post/item_list/' ? '{"itemList":[{"id":"1"}]}' : '{"other":1}'))
    const document = {
      readyState: 'complete',
      scrollingElement: { scrollHeight: 900 },
      querySelectorAll: (selector: string) => (selector.startsWith('meta') ? [] : [{ textContent: '{"userInfo":{"itemList":[]}}' }]),
    }
    const window = { fetch: pageFetch, NoraI: { onMessage: (payload: string) => sent.push(payload) }, scrollTo: () => {} } as any
    new Function('window', 'document', 'setTimeout', buildWatchPageScript(5, TIKTOK_POSTS_MARKER, 1))(
      window,
      document,
      (callback: () => void) => timers.push(callback),
    )
    timers.shift()!()
    expect(sent).toHaveLength(0)
    // The page still gets its answers.
    expect(await window.fetch('/api/other/')).toHaveProperty('clone')
    await window.fetch('/api/post/item_list/')
    await new Promise((resolve) => setTimeout(resolve, 0))
    timers.shift()!()
    expect(sent).toHaveLength(1)
    const { html } = JSON.parse(sent[0]).data
    expect(html).toBe('<script type="application/json">{"itemList":[{"id":"1"}]}</script>')
  })
})

describe('buildWatchPageScript with until', () => {
  it('scrolls until a post as old as the time asked for has loaded, past a pinned one in the page', () => {
    const sent: string[] = []
    const timers: (() => void)[] = []
    class FakeXHR {
      responseType = ''
      responseText = ''
      listeners: (() => void)[] = []
      addEventListener(_: string, listener: () => void) {
        this.listeners.push(listener)
      }
      send() {}
    }
    const document = {
      readyState: 'complete',
      scrollingElement: { scrollHeight: 900 },
      // The page's own posts, an old pinned one among them.
      querySelectorAll: (selector: string) =>
        selector.startsWith('meta') ? [] : [{ textContent: '{"__typename":"Story","post_id":"1","creation_time":100}' }],
    }
    const window = { XMLHttpRequest: FakeXHR, NoraI: { onMessage: (payload: string) => sent.push(payload) }, scrollTo: () => {} } as any
    new Function('window', 'document', 'XMLHttpRequest', 'setTimeout', buildWatchPageScript(5, '"post_id"', 2, 300))(
      window,
      document,
      FakeXHR,
      (callback: () => void) => timers.push(callback),
    )
    const load = (text: string) => {
      const xhr = new FakeXHR()
      xhr.send()
      xhr.responseText = text
      xhr.listeners.forEach((listener) => listener.call(xhr))
    }
    const story = (id: string, time: number, more = {}) => JSON.stringify({ node: { __typename: 'Story', post_id: id, creation_time: time, ...more } })
    // More parts than asked for, but none as old yet: not the post one of them shares, written first.
    load(`${story('2', 500)}\n${JSON.stringify({ node: { attached_story: { __typename: 'Story', post_id: '9', creation_time: 10 }, __typename: 'Story', post_id: '3', creation_time: 400 } })}`)
    timers.shift()!()
    expect(sent).toHaveLength(0)
    // Nor one pinned to the top, brought later, nor an ad.
    load(JSON.stringify({ profile_pinned_post: JSON.parse(story('8', 50)) }))
    load(story('7', 60, { sponsored_data: { ad_id: '1' } }))
    timers.shift()!()
    expect(sent).toHaveLength(0)
    // A post that tells its time deeper in it, as a reel does.
    load(JSON.stringify({ node: { __typename: 'Story', post_id: '4', comet_sections: { context_layout: { story: { creation_time: 290 } } } } }))
    timers.shift()!()
    expect(sent).toHaveLength(1)
  })
})

describe('buildWatchPageScript told to slow down', () => {
  it('sends at once when an answer the page loaded said to slow down', () => {
    const sent: string[] = []
    const timers: (() => void)[] = []
    class FakeXHR {
      responseType = ''
      responseText = ''
      listeners: (() => void)[] = []
      addEventListener(_: string, listener: () => void) {
        this.listeners.push(listener)
      }
      send() {}
    }
    const document = {
      readyState: 'complete',
      scrollingElement: { scrollHeight: 900 },
      querySelectorAll: (selector: string) => (selector.startsWith('meta') ? [] : [{ textContent: '{"post_id":"1"}' }]),
    }
    const window = { XMLHttpRequest: FakeXHR, NoraI: { onMessage: (payload: string) => sent.push(payload) }, scrollTo: () => {} } as any
    new Function('window', 'document', 'XMLHttpRequest', 'setTimeout', buildWatchPageScript(4, '"post_id"', 10))(
      window,
      document,
      FakeXHR,
      (callback: () => void) => timers.push(callback),
    )
    const xhr = new FakeXHR()
    xhr.send()
    xhr.responseText = '{"errors":[{"message":"Rate limit exceeded","severity":"CRITICAL","code":1675004}]}'
    xhr.listeners.forEach((listener) => listener.call(xhr))
    timers.shift()!()
    expect(sent).toHaveLength(1)
    expect(JSON.parse(sent[0]).data).toMatchObject({ id: 4, rateLimited: true })
  })
})

describe('buildWatchPageScript with a selector', () => {
  it('sends those parts of the page', () => {
    const sent: string[] = []
    const document = {
      readyState: 'complete',
      querySelectorAll: (selector: string) =>
        selector === IMGINN_PAGE_SELECTOR ? [{ outerHTML: '<div class="userinfo"></div>' }, { outerHTML: '<div class="items"></div>' }] : [],
    }
    const window = { NoraI: { onMessage: (payload: string) => sent.push(payload) } } as any
    new Function('window', 'document', buildWatchPageScript(6, undefined, 0, 0, IMGINN_PAGE_SELECTOR))(window, document)
    expect(JSON.parse(sent[0]).data).toMatchObject({ id: 6, html: '<div class="userinfo"></div>\n<div class="items"></div>', challenge: false })
  })

  it("tells Cloudflare's check for a browser, and sends nothing more from its page", () => {
    const sent: string[] = []
    const timers: (() => void)[] = []
    const document = { readyState: 'complete', querySelectorAll: () => [] }
    const window = { _cf_chl_opt: {}, NoraI: { onMessage: (payload: string) => sent.push(payload) } } as any
    new Function('window', 'document', 'setTimeout', buildWatchPageScript(6, undefined, 0, 0, IMGINN_PAGE_SELECTOR))(
      window,
      document,
      (callback: () => void) => timers.push(callback),
    )
    expect(sent.map((payload) => JSON.parse(payload).data)).toEqual([{ id: 6, html: '', rateLimited: false, challenge: true }])
    expect(timers).toHaveLength(0)
  })
})

describe('loadInWatchWebView', () => {
  it('fails at once when there is no webview to load in', async () => {
    await expect(loadInWatchWebView('https://www.instagram.com/nasa/')).rejects.toThrow('no webview host')
  })

  it('loads one page at a time, each answered by its own id', async () => {
    watchWebView$.hostMounted.set(true)
    const first = loadInWatchWebView('https://www.instagram.com/a/')
    const second = loadInWatchWebView('https://www.instagram.com/b/')
    await Promise.resolve()
    const firstJob = watchWebView$.job.peek()!
    expect(firstJob.url).toBe('https://www.instagram.com/a/')

    // An answer for a page that is not the one loading is not taken for it.
    onWatchWebViewMessage(firstJob.id + 100, '<html>stale</html>')
    onWatchWebViewMessage(firstJob.id, '<html>a</html>')
    expect(await first).toBe('<html>a</html>')

    await new Promise((resolve) => setTimeout(resolve, 0))
    const secondJob = watchWebView$.job.peek()!
    expect(secondJob.url).toBe('https://www.instagram.com/b/')
    onWatchWebViewError(secondJob.id, new Error('boom'))
    await expect(second).rejects.toThrow('boom')
    expect(watchWebView$.job.peek()).toBeNull()
  })

  it('takes a page without posts for a failure', async () => {
    watchWebView$.hostMounted.set(true)
    const result = loadInWatchWebView('https://www.instagram.com/a/')
    await new Promise((resolve) => setTimeout(resolve, 0))
    onWatchWebViewMessage(watchWebView$.job.peek()!.id, '')
    await expect(result).rejects.toThrow('no posts in the page')
  })

  it('tells a page the site said to slow down on, even with its first posts', async () => {
    watchWebView$.hostMounted.set(true)
    const result = loadInWatchWebView('https://www.facebook.com/NASA/')
    await new Promise((resolve) => setTimeout(resolve, 0))
    onWatchWebViewMessage(watchWebView$.job.peek()!.id, '<script type="application/json">{"post_id":"1"}</script>', true)
    await expect(result).rejects.toThrow(WATCH_WEBVIEW_RATE_LIMITED)
  })

  it("waits past Cloudflare's check for the page, and tells the check when it never passed", async () => {
    watchWebView$.hostMounted.set(true)
    const passed = loadInWatchWebView('https://imginn.com/a/', 50, { selector: IMGINN_PAGE_SELECTOR })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const id = watchWebView$.job.peek()!.id
    onWatchWebViewMessage(id, '', false, true)
    onWatchWebViewMessage(id, '<div class="userinfo"></div>')
    expect(await passed).toBe('<div class="userinfo"></div>')

    const stuck = loadInWatchWebView('https://imginn.com/a/', 50, { selector: IMGINN_PAGE_SELECTOR })
    await new Promise((resolve) => setTimeout(resolve, 0))
    onWatchWebViewMessage(watchWebView$.job.peek()!.id, '', false, true)
    await expect(stuck).rejects.toThrow(WATCH_WEBVIEW_CHALLENGE)
  })

  it('shows a visible page for all of its time, until the user closes it', async () => {
    watchWebView$.hostMounted.set(true)
    const result = loadInWatchWebView('https://imginn.com/a/', 60 * 60 * 1000, { selector: IMGINN_PAGE_SELECTOR, visible: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    const job = watchWebView$.job.peek()!
    expect(job.visible).toBe(true)
    cancelWatchWebView(job.id)
    await expect(result).rejects.toThrow(WATCH_WEBVIEW_CANCELLED)
  })
})
