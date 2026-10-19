import { afterEach, describe, expect, it } from 'bun:test'
import { buildWatchPageScript, loadInWatchWebView, onWatchWebViewError, onWatchWebViewMessage, watchWebView$ } from './watch-webview'

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
})
