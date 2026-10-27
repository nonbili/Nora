import { observable } from '@legendapp/state'

/**
 * Loads a page in a webview nobody sees, for a watched profile a plain request can't read.
 * It needs the app's UI to be there, so it is only offered while Nora is open.
 */

// Cookies of their own, apart from every profile the user has: the page is read without an account.
export const WATCH_WEBVIEW_PROFILE = 'nora-watch'

const PAGE_TIMEOUT_MS = 30 * 1000
// For a page scrolled for more: the page itself can take most of the time above to load.
const MORE_PAGE_TIMEOUT_MS = 60 * 1000
// How long the script in the page waits for the posts to be there before it gives up.
const SCRIPT_POLL_MS = 500
const SCRIPT_MAX_TRIES = 30
// And while it scrolls for more, which come a post or two at a time: well within the page's time limit.
const SCRIPT_MORE_MAX_TRIES = 50
// While scrolling for more, how long nothing new may come before what is there is sent.
const SCRIPT_IDLE_TRIES = 8

export interface WatchWebViewJob {
  id: number
  url: string
  marker: string
  // How many parts with posts to wait for, scrolling down for more; 0 to send the first found.
  more: number
  // Or, scrolling down, the time to read back to, in seconds, as Facebook tells when a post was made.
  until?: number
  // The Nora profile whose cookies the page is loaded with; the webview's own, without an account, if none.
  profile?: string
  // The parts of the page to send, as HTML, for a site whose posts are in the page itself, not in data it carries.
  selector?: string
  // Shown to the user, who is to pass the check of the site the page is on, as imginn's.
  visible?: boolean
  // As the browser it is, not one on a computer: a check for a browser fails one that says it is another.
  ownUserAgent?: boolean
}

export const watchWebView$ = observable<{ job: WatchWebViewJob | null; hostMounted: boolean }>({
  job: null,
  hostMounted: false,
})

let nextId = 1
let queue: Promise<unknown> = Promise.resolve()
let current: { id: number; resolve: (html: string) => void; reject: (error: Error) => void; challenged?: boolean } | null = null

export const isWatchWebViewAvailable = () => watchWebView$.hostMounted.peek()

// What the data of a profile page's posts has in it, on Instagram.
export const INSTAGRAM_POSTS_MARKER = 'polaris_ordered_timeline_connection'
// And on Threads.
export const THREADS_POSTS_MARKER = '"mediaData"'
// And on Facebook, in the page and in each of the answers that bring more as it is scrolled.
export const FACEBOOK_POSTS_MARKER = '"post_id"'
// And on TikTok, in the answers that bring a profile's videos, as its page asks for them.
export const TIKTOK_POSTS_MARKER = '"itemList":[{'

// What a page is rejected with when one of the answers it asked for said to slow down: what it has then is no more than its first posts.
export const WATCH_WEBVIEW_RATE_LIMITED = 'rate limited in the page'
// And when it was still at Cloudflare's check for a browser when its time was up.
export const WATCH_WEBVIEW_CHALLENGE = 'challenge in the page'
// And when the user closed the page they were shown.
export const WATCH_WEBVIEW_CANCELLED = 'page closed'

// What imginn's profile page is sent of: the profile's name and picture, and its grid of posts.
export const IMGINN_PAGE_SELECTOR = '.userinfo, .items'

/**
 * The script run in the page. It sends back the page's preview tags and the data its posts are
 * drawn from, told by `marker`, as a small page of their own, or nothing when the posts never come.
 * With `more`, it also keeps the answers the page asks its site for while it is scrolled down,
 * as Facebook brings the posts after its first, and TikTok all of them, until that many parts
 * with posts are there or no more come; with `until`, until a post as old as that has come
 * instead: a post of the page, as Facebook has them, not one it shares, one pinned to its top,
 * nor an ad. It tells when one of those answers said to slow down, as Facebook's do. With
 * `selector`, it sends those parts of the page instead. It tells too when the page is Cloudflare's
 * check for a browser, which loads the page asked for in a document of its own once passed.
 */
export const buildWatchPageScript = (id: number, marker = INSTAGRAM_POSTS_MARKER, more = 0, until = 0, selector = '') => `(function () {
  // Run at the start of every document of the page: only the page itself answers.
  if (window.__noraWatchStarted || (window.top && window.top !== window)) return;
  window.__noraWatchStarted = true;
  var marker = ${JSON.stringify(marker)};
  var selector = ${JSON.stringify(selector)};
  var tries = 0;
  var idle = 0;
  var last = 0;
  var loaded = [];
  // The time of the oldest post loaded while scrolling; a pinned post in the page itself can be older than any.
  var oldest = Infinity;
  var rateLimited = false;
  // When a post was made: told on it, or deeper in it, but not in what it shares nor in its comments.
  function postTime(value) {
    if (!value || typeof value !== 'object') return undefined;
    if (typeof value.creation_time === 'number') return value.creation_time;
    for (var key in value) {
      if (key === 'attached_story' || key === 'feedback') continue;
      var time = postTime(value[key]);
      if (time !== undefined) return time;
    }
    return undefined;
  }
  function postTimes(value, pinned) {
    if (!value || typeof value !== 'object') return;
    if (value.__typename === 'Story' && value.post_id) {
      // An ad is not one of the page's posts either.
      var time = pinned || value.sponsored_data ? undefined : postTime(value);
      if (time !== undefined) oldest = Math.min(oldest, time);
      return;
    }
    for (var key in value) postTimes(value[key], pinned || key === 'profile_pinned_post' || key === 'highlight_units');
  }
  function keep(text) {
    if (typeof text !== 'string') return;
    if (text.indexOf('Rate limit exceeded') !== -1) rateLimited = true;
    if (text.indexOf(marker) === -1) return;
    // An answer can be several documents, a line each.
    text.split('\\n').forEach(function (line) {
      if (line.indexOf(marker) === -1) return;
      var data = line.replace(/^for \\(;;\\);/, '');
      loaded.push(data);
      if (${until > 0}) {
        try {
          postTimes(JSON.parse(data), false);
        } catch (e) {}
      }
    });
  }
  if (${more > 0} && window.XMLHttpRequest) {
    var xhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
      this.addEventListener('load', function () {
        try {
          if (this.responseType === '' || this.responseType === 'text') keep(this.responseText);
        } catch (e) {}
      });
      return xhrSend.apply(this, arguments);
    };
  }
  // And those asked for with fetch, as TikTok asks for its posts.
  if (${more > 0} && window.fetch) {
    var pageFetch = window.fetch;
    window.fetch = function () {
      return pageFetch.apply(this, arguments).then(function (res) {
        try {
          res.clone().text().then(keep, function () {});
        } catch (e) {}
        return res;
      });
    };
  }
  function send(html, challenge) {
    var data = { id: ${id}, html: html, rateLimited: rateLimited, challenge: Boolean(challenge) };
    if (window.NoraI) window.NoraI.onMessage(JSON.stringify({ type: 'watch-page', data: data }));
    // On desktop, the webview's host hears it.
    else if (window.electron) window.electron.ipcRenderer.sendToHost('watch-page', data);
  }
  function collect() {
    // Set by Cloudflare's check for a browser, in its page, before the page's own.
    if (window._cf_chl_opt) {
      send('', true);
      return;
    }
    if (selector) {
      var nodes = document.querySelectorAll(selector);
      if (nodes.length || ++tries > ${SCRIPT_MAX_TRIES}) {
        send(Array.prototype.map.call(nodes, function (node) { return node.outerHTML; }).join('\\n'));
        return;
      }
      setTimeout(collect, ${SCRIPT_POLL_MS});
      return;
    }
    var parts = [];
    var found = 0;
    document.querySelectorAll('meta[property^="og:"]').forEach(function (meta) { parts.push(meta.outerHTML); });
    document.querySelectorAll('script[type="application/json"]').forEach(function (script) {
      if (script.textContent.indexOf(marker) !== -1) {
        found++;
        parts.push('<script type="application/json">' + script.textContent + '</' + 'script>');
      }
    });
    loaded.forEach(function (text) {
      found++;
      parts.push('<script type="application/json">' + text + '</' + 'script>');
    });
    idle = found === last ? idle + 1 : 0;
    last = found;
    var enough = (${until} ? oldest <= ${until} : found >= Math.max(1, ${more})) || (found > 0 && idle >= ${SCRIPT_IDLE_TRIES});
    // No more will come once the site said to slow down.
    if (enough || rateLimited || ++tries > ${more > 0 ? SCRIPT_MORE_MAX_TRIES : SCRIPT_MAX_TRIES}) {
      send(found ? parts.join('\\n') : '');
      return;
    }
    if (${more > 0} && document.scrollingElement) window.scrollTo(0, document.scrollingElement.scrollHeight);
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

/**
 * Called by the host with what the page's script sent. At Cloudflare's check, the page is waited
 * for still: the check can pass by itself, or be passed by the user in a page they are shown.
 */
export const onWatchWebViewMessage = (id: number, html: string, rateLimited = false, challenge = false) => {
  if (challenge) {
    if (current?.id === id) current.challenged = true
  } else if (rateLimited) finish(id, { error: new Error(WATCH_WEBVIEW_RATE_LIMITED) })
  else finish(id, html ? { html } : { error: new Error('no posts in the page') })
}

export const onWatchWebViewError = (id: number, error: Error) => finish(id, { error })

/** When the user closes a page they were shown. */
export const cancelWatchWebView = (id: number) => finish(id, { error: new Error(WATCH_WEBVIEW_CANCELLED) })

/**
 * The page's preview tags and post data, read by the hidden webview; one page at a time. A page
 * `visible` to the user is given all of `timeoutMs`, as they may take a while over it.
 */
export const loadInWatchWebView = (
  url: string,
  timeoutMs = PAGE_TIMEOUT_MS,
  {
    marker = INSTAGRAM_POSTS_MARKER,
    more = 0,
    until,
    profile,
    selector,
    visible,
    ownUserAgent,
  }: {
    marker?: string
    more?: number
    until?: number
    profile?: string
    selector?: string
    visible?: boolean
    ownUserAgent?: boolean
  } = {},
): Promise<string> => {
  const run = () =>
    new Promise<string>((resolve, reject) => {
      if (!watchWebView$.hostMounted.peek()) {
        reject(new Error('no webview host'))
        return
      }
      const id = nextId++
      current = { id, resolve, reject }
      watchWebView$.job.set({ id, url, marker, more, until, profile, selector, visible, ownUserAgent })
      const timeout = visible ? timeoutMs : Math.min(timeoutMs, more > 0 ? MORE_PAGE_TIMEOUT_MS : PAGE_TIMEOUT_MS)
      setTimeout(() => {
        const challenged = current?.id === id && current.challenged
        finish(id, { error: new Error(challenged ? WATCH_WEBVIEW_CHALLENGE : 'page timed out') })
      }, timeout)
    })
  const result = queue.then(run, run)
  queue = result.catch(() => {})
  return result
}
