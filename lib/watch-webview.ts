import { observable } from '@legendapp/state'

/**
 * Loads a page in a webview nobody sees, for a watched profile a plain request can't read.
 * It needs the app's UI to be there, so it is only offered while Nora is open.
 */

// Cookies of their own, apart from every profile the user has: the page is read without an account.
export const WATCH_WEBVIEW_PROFILE = 'nora-watch'

const PAGE_TIMEOUT_MS = 30 * 1000
// How long the script in the page waits for the posts to be there before it gives up.
const SCRIPT_POLL_MS = 500
const SCRIPT_MAX_TRIES = 30

export interface WatchWebViewJob {
  id: number
  url: string
}

export const watchWebView$ = observable<{ job: WatchWebViewJob | null; hostMounted: boolean }>({
  job: null,
  hostMounted: false,
})

let nextId = 1
let queue: Promise<unknown> = Promise.resolve()
let current: { id: number; resolve: (html: string) => void; reject: (error: Error) => void } | null = null

export const isWatchWebViewAvailable = () => watchWebView$.hostMounted.peek()

/**
 * The script run in the page. It sends back the page's preview tags and the data its grid of
 * posts is drawn from, as a small page of their own, or nothing when the posts never come.
 */
export const buildWatchPageScript = (id: number) => `(function () {
  if (window.__noraWatchStarted) return;
  window.__noraWatchStarted = true;
  var tries = 0;
  function send(html) {
    if (window.NoraI) window.NoraI.onMessage(JSON.stringify({ type: 'watch-page', data: { id: ${id}, html: html } }));
  }
  function collect() {
    var parts = [];
    var found = false;
    document.querySelectorAll('meta[property^="og:"]').forEach(function (meta) { parts.push(meta.outerHTML); });
    document.querySelectorAll('script[type="application/json"]').forEach(function (script) {
      if (script.textContent.indexOf('polaris_ordered_timeline_connection') !== -1) {
        found = true;
        parts.push('<script type="application/json">' + script.textContent + '</' + 'script>');
      }
    });
    if (found || ++tries > ${SCRIPT_MAX_TRIES}) {
      send(found ? parts.join('\\n') : '');
      return;
    }
    setTimeout(collect, ${SCRIPT_POLL_MS});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', collect);
  else collect();
})();`

const finish = (id: number, result: { html: string } | { error: Error }) => {
  if (!current || current.id !== id) return
  const { resolve, reject } = current
  current = null
  watchWebView$.job.set(null)
  if ('html' in result) resolve(result.html)
  else reject(result.error)
}

/** Called by the host with what the page's script sent. */
export const onWatchWebViewMessage = (id: number, html: string) => {
  finish(id, html ? { html } : { error: new Error('no posts in the page') })
}

export const onWatchWebViewError = (id: number, error: Error) => finish(id, { error })

/** The page's preview tags and post data, read by the hidden webview; one page at a time. */
export const loadInWatchWebView = (url: string): Promise<string> => {
  const run = () =>
    new Promise<string>((resolve, reject) => {
      if (!watchWebView$.hostMounted.peek()) {
        reject(new Error('no webview host'))
        return
      }
      const id = nextId++
      current = { id, resolve, reject }
      watchWebView$.job.set({ id, url })
      setTimeout(() => finish(id, { error: new Error('page timed out') }), PAGE_TIMEOUT_MS)
    })
  const result = queue.then(run, run)
  queue = result.catch(() => {})
  return result
}
