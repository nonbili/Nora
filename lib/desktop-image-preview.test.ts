import { describe, expect, it } from 'bun:test'
import { readImage } from '../desktop/src/main/lib/image-preview'

function source(fetchImage: (url: string, options: RequestInit) => Promise<Response>) {
  return { session: { fetch: fetchImage }, getURL: () => 'https://private.test/page' } as unknown as Electron.WebContents
}

describe('image preview loading', () => {
  it('uses the source session, cookies and referrer and preserves the image bytes', async () => {
    const contents = source(async (url, options) => {
      expect(url).toBe('https://private.test/image')
      expect(options.credentials).toBe('include')
      expect(options.referrer).toBe('https://private.test/page')
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/gif' } })
    })
    expect(await readImage(contents, 'https://private.test/image')).toBe('data:image/gif;base64,AQID')
  })

  it('rejects HTML responses and non-image data URLs', async () => {
    const contents = source(async () => new Response('<html/>', { headers: { 'content-type': 'text/html' } }))
    await expect(readImage(contents, 'https://private.test/image')).rejects.toThrow('not an image')
    await expect(readImage(contents, 'data:text/html,test')).rejects.toThrow('Unsupported')
    await expect(readImage(contents, 'file:///tmp/image.png')).rejects.toThrow('Unsupported')
  })

  it('passes image data URLs through without a network request', async () => {
    const contents = source(async () => { throw new Error('Unexpected network request') })
    expect(await readImage(contents, 'data:image/png;base64,AQID')).toBe('data:image/png;base64,AQID')
  })

  it('validates blob results in the main process and reads from the source frame', async () => {
    const contents = source(async () => { throw new Error('Unexpected network request') })
    const frame = (result: unknown) => ({ executeJavaScript: async () => result }) as unknown as Electron.WebFrameMain
    const url = 'blob:https://frame.test/image'
    expect(await readImage(contents, url, frame('data:image/png;base64,AQID'))).toBe('data:image/png;base64,AQID')
    for (const result of [null, {}, 42, 'https://remote.test/image', 'data:text/html,test']) {
      await expect(readImage(contents, url, frame(result))).rejects.toThrow('Invalid image')
    }
    await expect(readImage(contents, url, frame('data:image/png;base64,' + 'A'.repeat(45 * 1024 * 1024)))).rejects.toThrow('too large')
  })

  it('cancels unsuccessful HTTP responses', async () => {
    let cancelled = false
    const contents = source(async () => new Response(new ReadableStream({
      cancel() { cancelled = true },
    }), { status: 403 }))
    await expect(readImage(contents, 'https://private.test/denied')).rejects.toThrow('Could not load image')
    expect(cancelled).toBe(true)
  })

  it('cancels oversized downloads', async () => {
    let cancelled = false
    const contents = source(async () => new Response(new ReadableStream({
      pull(controller) { controller.enqueue(new Uint8Array(17 * 1024 * 1024)) },
      cancel() { cancelled = true },
    }), { headers: { 'content-type': 'image/png' } }))
    await expect(readImage(contents, 'https://private.test/large')).rejects.toThrow('too large')
    expect(cancelled).toBe(true)
  })
})

import { imagePreview$, showImagePreview, updateImagePreview } from '../desktop/src/renderer/lib/image-preview'

it('ignores image loads that finish after closing or opening another image', () => {
  showImagePreview('first')
  showImagePreview('second')
  updateImagePreview('first', 'data:image/png;base64,old')
  expect(imagePreview$.get()).toEqual({ id: 'second', dataUrl: null, error: false })
  updateImagePreview('second', null)
  expect(imagePreview$.get()?.error).toBe(true)
  imagePreview$.set(null)
  updateImagePreview('second', 'data:image/png;base64,new')
  expect(imagePreview$.get()).toBeNull()
})
