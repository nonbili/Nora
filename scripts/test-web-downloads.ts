// Run with `bun scripts/test-web-downloads.ts`.
// Android over USB: `adb reverse tcp:8781 tcp:8781`, then open http://localhost:8781 in Nora.
const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNQKbgBAAIoAW17xdT7AAAAAElFTkSuQmCC'
const png = Uint8Array.from(atob(pngBase64), (byte) => byte.charCodeAt(0))

const page = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nora download test</title>
<style>
  body { font: 1rem system-ui; max-width: 40rem; margin: 2rem auto; padding: 0 1rem; }
  li { margin: .8rem 0; }
  button { font: inherit; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; }
</style>
<h1>Nora download test</h1>
<p>Try one case at a time. Each uses the same tiny PNG with a different filename.
Check for a system save dialog, Nora feedback, and the actual file. A log entry
that says a click was dispatched does not mean the file was saved.</p>
<p><a href="/restricted">Repeat with a strict connect-src policy</a> · <a href="/">Unrestricted page</a></p>
<ol>
  <li><a href="/attachment.png">HTTP link with Content-Disposition: attachment</a></li>
  <li><a href="/inline.png" download="nora-http-anchor.png">HTTP image with &lt;a download&gt;</a></li>
  <li><a id="blob-link" download="nora-blob-link.png">Blob URL with &lt;a download&gt;</a></li>
  <li><button type="button" id="blob-detached">Click a detached Blob anchor and revoke its URL</button></li>
  <li><button type="button" id="fetch-blob">Fetch image, then click a detached Blob anchor</button></li>
  <li><a id="data-link" download="nora-data.png">Data URL with &lt;a download&gt;</a></li>
  <li><button type="button" id="picker">Use showSaveFilePicker()</button> <span id="picker-support"></span></li>
</ol>
<h2>Page log</h2>
<pre id="log" aria-live="polite"></pre>
<script>
  const dataUrl = 'data:image/png;base64,${pngBase64}'
  const image = new Blob([Uint8Array.from(atob('${pngBase64}'), byte => byte.charCodeAt(0))], { type: 'image/png' })
  const log = message => {
    document.querySelector('#log').textContent += message + '\\n'
    console.info('[download test]', message)
  }
  document.querySelector('#blob-link').href = URL.createObjectURL(image)
  document.querySelector('#data-link').href = dataUrl
  for (const link of document.querySelectorAll('li a')) {
    link.addEventListener('click', () => log('Clicked: ' + link.textContent.trim()))
  }

  function clickBlob(blob, name, revokeImmediately = false) {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.click()
    if (revokeImmediately) URL.revokeObjectURL(url)
    else setTimeout(() => URL.revokeObjectURL(url), 60_000)
    log('Dispatched click for ' + name + (revokeImmediately ? ' and revoked its URL' : ''))
  }

  document.querySelector('#blob-detached').onclick = () => clickBlob(image, 'nora-blob-revoked.png', true)
  document.querySelector('#fetch-blob').onclick = async () => {
    try {
      const response = await fetch('/inline.png')
      if (!response.ok) throw new Error('HTTP ' + response.status)
      clickBlob(await response.blob(), 'nora-fetch-blob.png')
    } catch (error) {
      log('Fetch-to-Blob failed: ' + error)
    }
  }

  const pickerAvailable = typeof window.showSaveFilePicker === 'function'
  document.querySelector('#picker-support').textContent = pickerAvailable
    ? '(available)'
    : '(unavailable; secure context: ' + window.isSecureContext + ')'
  document.querySelector('#picker').onclick = async () => {
    if (!pickerAvailable) return log('showSaveFilePicker() is unavailable on this page')
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'nora-save-picker.png',
        types: [{ description: 'PNG image', accept: { 'image/png': ['.png'] } }],
      })
      const writable = await handle.createWritable()
      await writable.write(image)
      await writable.close()
      log('Picker write completed: ' + handle.name)
    } catch (error) {
      log('Picker: ' + error)
    }
  }
</script>
</html>`

const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 8781,
  routes: {
    '/': () => new Response(page, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
    '/restricted': () => new Response(page, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': "connect-src 'self'",
      },
    }),
    '/attachment.png': () => new Response(png, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': 'attachment; filename="nora-http-attachment.png"',
      },
    }),
    '/inline.png': () => new Response(png, { headers: { 'Content-Type': 'image/png' } }),
  },
  fetch: () => new Response('Not found', { status: 404 }),
})

console.log(`Download test page: ${server.url}`)
