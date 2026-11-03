import { describe, expect, it } from 'bun:test'
import { sanitizeDownloadName, trackBlobDownloadNames } from './blob-download'

function setup() {
  let clicks = 0
  const events: Event[] = []
  class Anchor {
    constructor(
      public href: string,
      public download: string,
    ) {}
    click() {
      clicks++
    }
    dispatchEvent(event: Event) {
      events.push(event)
      return !event.defaultPrevented
    }
  }
  let listener: (event: any) => void = () => {}
  const getName = trackBlobDownloadNames(
    { HTMLAnchorElement: Anchor } as any,
    {
      addEventListener: (_: string, fn: any) => {
        listener = fn
      },
    } as any,
  )
  return { Anchor, getName, listener, events, clicks: () => clicks }
}

describe('blob download filenames', () => {
  it('remembers FileSaver-style detached dispatches and preserves cancellation', () => {
    const { Anchor, getName, events } = setup()
    const anchor = new Anchor('blob:detached', 'export.html')
    expect(anchor.dispatchEvent(new Event('mouseover'))).toBe(true)
    expect(getName(anchor.href)).toBeUndefined()
    const click = new Event('click', { cancelable: true })
    click.preventDefault()
    expect(anchor.dispatchEvent(click)).toBe(false)
    expect(getName(anchor.href)).toBe('export.html')
    expect(events[1]).toBe(click)
  })
  it('keeps filenames within the destination directory', () => {
    expect(sanitizeDownloadName('../test.html')).toBe('.._test.html')
    expect(sanitizeDownloadName('..\\test.html')).toBe('.._test.html')
    expect(sanitizeDownloadName('..')).toBe('download')
    expect(sanitizeDownloadName('')).toBe('download')
    expect(sanitizeDownloadName('report\u0000.html')).toBe('report_.html')
    expect(sanitizeDownloadName('日本語.html')).toBe('日本語.html')
  })
  it('remembers detached export links without replacing native click', () => {
    const { Anchor, getName, clicks } = setup()
    new Anchor('blob:https://claude.ai/uuid', 'artifact.html').click()
    expect(getName('blob:https://claude.ai/uuid')).toBe('artifact.html')
    expect(clicks()).toBe(1)
  })
  it('captures user clicks through nested elements and shadow roots', () => {
    const { Anchor, getName, listener } = setup()
    listener({ composedPath: () => [{}, new Anchor('blob:example', 'report.pdf')] })
    expect(getName('blob:example')).toBe('report.pdf')
  })
  it('ignores ordinary links and unnamed blobs', () => {
    const { Anchor, getName } = setup()
    new Anchor('https://example.com/file', 'file.html').click()
    new Anchor('blob:unnamed', '').click()
    expect(getName('https://example.com/file')).toBeUndefined()
    expect(getName('blob:unnamed')).toBeUndefined()
  })
  it('bounds retained names and uses the latest name for a reused URL', () => {
    const { Anchor, getName } = setup()
    for (let i = 0; i < 10; i++) new Anchor(`blob:${i}`, `${i}.txt`).click()
    expect(getName('blob:0')).toBeUndefined()
    new Anchor('blob:9', 'renamed.html').click()
    expect(getName('blob:9')).toBe('renamed.html')
  })
})
