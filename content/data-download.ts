// A data URL already contains its bytes. Don't fetch it in the page, where
// connect-src can block fetch even though the browser allowed the download.
export function decodeDataDownload(url: string) {
  const source = url.slice(5).split('#', 1)[0]
  const comma = source.indexOf(',')
  if (comma === -1) throw new Error('Invalid data URL')

  let type = source.slice(0, comma).trim()
  const base64 = /; *base64$/i.test(type)
  if (base64) type = type.replace(/; *base64$/i, '')
  // Android's file type and extension lookup expects a bare MIME type. A
  // charset doesn't affect decoding here: the data URL already encodes bytes.
  type = type.split(';', 1)[0].trim()
  if (!/^[\w!#$%&'*+.^`|~-]+\/[\w!#$%&'*+.^`|~-]+$/.test(type)) {
    type = 'text/plain'
  }

  const encoded = new TextEncoder().encode(source.slice(comma + 1))
  let length = 0
  const hex = (byte: number) => {
    if (byte >= 48 && byte <= 57) return byte - 48
    const lower = byte | 32
    return lower >= 97 && lower <= 102 ? lower - 87 : -1
  }
  for (let i = 0; i < encoded.length; i++) {
    if (encoded[i] === 37 && i + 2 < encoded.length) {
      const high = hex(encoded[i + 1])
      const low = hex(encoded[i + 2])
      if (high >= 0 && low >= 0) {
        encoded[length++] = (high << 4) | low
        i += 2
        continue
      }
    }
    encoded[length++] = encoded[i]
  }
  const bytes = encoded.subarray(0, length)
  const body = base64
    ? Uint8Array.from(atob(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)), (char) => char.charCodeAt(0))
    : bytes
  return { blob: new Blob([body]), mimeType: type.toLowerCase() }
}
