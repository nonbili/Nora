import { isBlocklistExcludedHost } from '../lib/blocklist/policy'

/**
 * Whether the user turned ad blocking off for the site this page is on, read
 * from the exceptions the app hands over at document start (see
 * `buildAdBlockingExclusionsScript`). The app pushes the resolved flag in its
 * settings too, but that only lands once the page has loaded -- by then a feed
 * response has been rewritten and ads have been hidden for good.
 */
export function isAdBlockingDisabledHere() {
  try {
    return isBlocklistExcludedHost(pageHost(), window.__noraBlocklistExcludedHosts || [])
  } catch (e) {
    return false
  }
}

/**
 * The host the switch was flipped for, which for a frame is the page it is
 * embedded in and not its own origin -- an embedded player is on youtube.com
 * whatever site is showing it. `ancestorOrigins` is readable cross-origin,
 * unlike `top.location`, and lists the outermost frame last.
 */
function pageHost() {
  const { ancestorOrigins, hostname } = document.location
  const top = ancestorOrigins?.length ? ancestorOrigins[ancestorOrigins.length - 1] : ''
  if (top && top !== 'null') {
    try {
      return new URL(top).hostname
    } catch (e) {}
  }
  return hostname
}

/**
 * Whether the anonymous mode is on for the site this page is on, from what the
 * app handed over at document start. It is only injected for a tab in the
 * Anonymous profile with the mode on, so its absence means off. Like the ad
 * blocking switch, the app's own push of the flag does not land until the page
 * has loaded.
 */
export function isAnonymousModeBootstrapped() {
  try {
    const disabledHosts = window.__noraAnonymousDisabledHosts
    return Array.isArray(disabledHosts) && !isBlocklistExcludedHost(pageHost(), disabledHosts)
  } catch (e) {
    return false
  }
}
