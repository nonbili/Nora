import { describe, expect, it } from 'bun:test'
import { decodeDataDownload } from './data-download'

describe('data download decoding', () => {
  it('decodes percent-encoded base64 and preserves the media type', async () => {
    const { blob, mimeType } = decodeDataDownload('data:image/png;BASE64,AP%2B%2F#ignored')
    expect(mimeType).toBe('image/png')
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([0, 255, 191])
  })

  it('decodes arbitrary bytes without treating them as UTF-8 text', async () => {
    const { blob } = decodeDataDownload('data:application/octet-stream,%FF%00%23+%ZZ')
    expect([...new Uint8Array(await blob.arrayBuffer())]).toEqual([255, 0, 35, 43, 37, 90, 90])
  })

  it('returns bare MIME types for Android without changing the bytes', async () => {
    expect(decodeDataDownload('data:,').mimeType).toBe('text/plain')
    expect(decodeDataDownload('data:text/csv;charset=utf-8,a,b').mimeType).toBe('text/csv')
    const { blob, mimeType } = decodeDataDownload('data:;charset=UTF-8,caf%C3%A9')
    expect(mimeType).toBe('text/plain')
    expect(await blob.text()).toBe('café')
  })

  it('rejects malformed data URLs and base64 instead of saving an empty file', () => {
    expect(() => decodeDataDownload('data:missing-comma')).toThrow()
    expect(() => decodeDataDownload('data:;base64,%%%')).toThrow()
  })
})
