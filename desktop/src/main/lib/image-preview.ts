const MAX_IMAGE_BYTES = 32 * 1024 * 1024

// Read through the source session so private images retain their profile cookies.
export async function readImage(contents: Electron.WebContents, url: string, frame?: Electron.WebFrameMain | null): Promise<string> {
  if (/^data:image\//i.test(url)) {
    if (url.length > MAX_IMAGE_BYTES * 4 / 3) throw new Error('Image is too large')
    return url
  }
  if (url.startsWith('blob:')) {
    // Blob URLs belong to the source document and cannot be fetched by net.fetch.
    const result: unknown = await (frame ?? contents).executeJavaScript(`(async () => {
      const response = await fetch(${JSON.stringify(url)}, { signal: AbortSignal.timeout(20000) });
      const blob = await response.blob();
      if (!blob.type.startsWith('image/') || blob.size > ${MAX_IMAGE_BYTES}) throw new Error('Invalid image');
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not read image'));
        reader.readAsDataURL(blob);
      });
    })()`)
    // Page globals can be replaced by site scripts; enforce the boundary here too.
    if (typeof result !== 'string' || !/^data:image\//i.test(result)) throw new Error('Invalid image')
    if (result.length > MAX_IMAGE_BYTES * 4 / 3) throw new Error('Image is too large')
    return result
  }
  if (!/^https?:/i.test(url)) throw new Error('Unsupported image URL')
  const response = await contents.session.fetch(url, {
    credentials: 'include',
    referrer: contents.getURL(),
    signal: AbortSignal.timeout(20_000),
  })
  if (!response.ok || !response.body) {
    await response.body?.cancel()
    throw new Error('Could not load image')
  }
  const type = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
  if (!type?.startsWith('image/')) {
    await response.body.cancel()
    throw new Error('Response is not an image')
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.length
    if (size > MAX_IMAGE_BYTES) {
      await reader.cancel()
      throw new Error('Image is too large')
    }
    chunks.push(value)
  }
  return `data:${type};base64,${Buffer.concat(chunks).toString('base64')}`
}
