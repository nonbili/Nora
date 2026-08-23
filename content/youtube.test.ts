import { beforeAll, describe, expect, it } from 'bun:test'
import { installYouTubeAdGuard } from './youtube'

const PLAYER_BODY = JSON.stringify({
  adPlacements: [{ adPlacementRenderer: {} }],
  playerAds: [{}],
  videoDetails: { videoId: 'abc' },
})

class FakeXhr {
  readyState = 4
  responseURL = ''
  body = ''

  get responseText() {
    return this.body
  }

  get response(): unknown {
    return this.body
  }
}

const globals = globalThis as any

function setupPage(host: string) {
  const created: any[] = []
  globals.window = globals
  globals.location = { host, href: `https://${host}/watch?v=abc` }
  globals.document = {
    documentElement: { appendChild: () => {} },
    head: { appendChild: (node: unknown) => created.push(node) },
    createElement: () => ({ id: '', textContent: '' }),
    addEventListener: () => {},
  }
  globals.Request = class Request {}
  globals.Response = class Response {
    constructor(
      readonly body: string,
      readonly init?: unknown,
    ) {}
    ok = true
    status = 200
    statusText = 'OK'
    headers = {}
    clone() {
      return this
    }
    text() {
      return Promise.resolve(this.body)
    }
  }
  globals.fetch = () => Promise.resolve(new globals.Response(PLAYER_BODY))
  globals.XMLHttpRequest = FakeXhr
  delete globals.__noraYouTubeAdGuard
  delete globals.ytInitialPlayerResponse
  return { created }
}

describe('installYouTubeAdGuard on a non-YouTube host', () => {
  beforeAll(() => {
    setupPage('www.reddit.com')
    installYouTubeAdGuard()
  })

  it('leaves the page alone', () => {
    expect(globals.XMLHttpRequest).toBe(FakeXhr)
    expect(globals.__noraYouTubeAdGuard).toBeUndefined()
  })
})

describe('installYouTubeAdGuard on an embedded player', () => {
  beforeAll(() => {
    setupPage('www.youtube-nocookie.com')
    installYouTubeAdGuard()
  })

  it('strips the inlined player response before page scripts read it', () => {
    globals.ytInitialPlayerResponse = JSON.parse(PLAYER_BODY)
    expect(globals.ytInitialPlayerResponse).toEqual({ videoDetails: { videoId: 'abc' } })
  })

  it('strips ads out of innertube fetch responses', async () => {
    const res = await globals.fetch('https://www.youtube-nocookie.com/youtubei/v1/player')
    expect(JSON.parse(await res.text())).toEqual({ videoDetails: { videoId: 'abc' } })
  })

  it('leaves other requests untouched', async () => {
    const res = await globals.fetch('https://www.youtube-nocookie.com/youtubei/v1/log_event')
    expect(JSON.parse(await res.text())).toHaveProperty('adPlacements')
  })

  it('strips ads out of innertube xhr responses', () => {
    const xhr = new globals.XMLHttpRequest()
    xhr.body = PLAYER_BODY
    xhr.responseURL = 'https://www.youtube-nocookie.com/youtubei/v1/next'
    expect(JSON.parse(xhr.responseText)).toEqual({ videoDetails: { videoId: 'abc' } })
    expect(JSON.parse(xhr.response)).toEqual({ videoDetails: { videoId: 'abc' } })

    xhr.readyState = 3
    expect(xhr.responseText).toBe(PLAYER_BODY)
  })

  it('installs once', () => {
    const patched = globals.XMLHttpRequest
    installYouTubeAdGuard()
    expect(globals.XMLHttpRequest).toBe(patched)
  })
})
