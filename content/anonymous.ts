import { anonymousRules, getAnonymousRules, type AnonymousRule } from './anonymous-rules'
import { noraSettingsEvent } from './nora'

const hiddenAttribute = 'data-nora-anonymous-hidden'
const promptAttribute = 'data-nora-anonymous-prompt'
const unpaddedAttribute = 'data-nora-anonymous-unpadded'
const SCAN_DELAY_MS = 250
// A match that was not a prompt is looked at again after this long, a few times: a dialog can be drawn
// before it floats, by a change of class or style that no scan follows.
const REJECTED_RETRY_MS = 1500
const MAX_REJECTIONS = 3
// How long the room a hidden top bar left is looked for, since a page can lay it out late.
const ROOM_SEARCH_MS = 10_000

/** The style half of the mode. One rule per selector, since a list is dropped whole when one entry does not parse. */
export function getAnonymousCss(host: string, enabled: boolean, rules: AnonymousRule[] = anonymousRules) {
  if (!enabled) {
    return ''
  }
  const matched = getAnonymousRules(host, rules)
  if (!matched.length) {
    return ''
  }

  const hidden = matched.flatMap((rule) => rule.hide || []).map((selector) => `${selector} { display: none !important; }`)
  return [
    ...hidden,
    `[${hiddenAttribute}] { display: none !important; }`,
    `[${unpaddedAttribute}] { padding-top: 0 !important; }`,
    // Only while a prompt is hidden, so a lock the site sets itself is left alone.
    // On html, not body: `overflow: auto` on a fixed-height body makes it a scroll container and the page stops moving.
    `html[${promptAttribute}] { overflow: auto !important; }`,
    `html[${promptAttribute}] body { overflow: visible !important; }`,
  ].join('\n')
}

/** The outermost fixed or sticky ancestor of a match; null when it sits in nothing floating, i.e. is part of the page. */
export function findOverlayTarget<T extends { parentElement: T | null; tagName: string }>(
  match: T,
  isFloating: (element: T) => boolean,
) {
  let target: T | null = null
  for (let node: T | null = match; node && node.tagName !== 'BODY' && node.tagName !== 'HTML'; node = node.parentElement) {
    if (isFloating(node)) {
      target = node
    }
  }
  return target
}

const PORTAL_TEXT_MARGIN = 200

/** The container under the body that a non-fixed prompt is mounted in; null when it holds much besides the prompt (the app itself). */
export function findPortalTarget<T extends { parentElement: T | null; tagName: string }>(
  match: T,
  textLength: (element: T) => number,
) {
  let top: T = match
  while (top.parentElement && top.parentElement.tagName !== 'BODY') {
    top = top.parentElement
  }
  if (!top.parentElement || top.tagName === 'BODY') {
    return null
  }
  return textLength(top) <= textLength(match) + PORTAL_TEXT_MARGIN ? top : null
}

/** The ancestor whose padding-top best matches a hidden top bar's height: the room the page made for it. Null if none is close. */
export function findPaddedAncestor<T extends { parentElement: T | null; tagName: string }>(
  start: T | null,
  barHeight: number,
  paddingTopOf: (element: T) => number,
  // The bar can carry a border and the page rounds its own scale (seen 64 vs 60).
  tolerance = 8,
) {
  if (barHeight <= 0) {
    return null
  }
  let best: T | null = null
  let bestDistance = Infinity
  for (let node = start; node && node.tagName !== 'BODY' && node.tagName !== 'HTML'; node = node.parentElement) {
    const padding = paddingTopOf(node)
    const distance = Math.abs(padding - barHeight)
    // Ties go to the outer one.
    if (padding > 0 && distance <= tolerance && distance <= bestDistance) {
      best = node
      bestDistance = distance
    }
  }
  return best
}

/** More text than this in a container means it is the page, not a prompt. */
export const OVERLAY_MAX_TEXT = 800

const isFloating = (element: Element) => {
  const { position } = getComputedStyle(element)
  return position === 'fixed' || position === 'sticky'
}

const isModeOn = () => Boolean(window.Nora?.getSettings?.().anonymousMode)

/** What was hidden for a match, kept to give back when the match goes. */
interface Handled {
  selector: string
  target: Element
  locksScroll: boolean
  unpadded?: Element
  barHeight: number
  /** Until when the room the bar left is looked for. */
  roomUntil: number
}

/** The script half of the mode, for prompts found only by their contents. Debounced; a failing selector is skipped. */
export function initAnonymousMode() {
  const { hostname } = document.location
  if (!getAnonymousRules(hostname).some((rule) => rule.overlays?.length || rule.portals?.length || rule.dismiss?.length)) {
    return () => {}
  }

  const handled = new Map<Element, Handled>()
  // Matches judged not to be prompts: how often, and when last.
  const rejected = new WeakMap<Element, { count: number; at: number }>()
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined

  const release = (entry: Handled) => {
    entry.target.removeAttribute(hiddenAttribute)
    entry.unpadded?.removeAttribute(unpaddedAttribute)
  }

  const releaseAll = () => {
    for (const entry of handled.values()) {
      release(entry)
    }
    handled.clear()
    document.documentElement.removeAttribute(promptAttribute)
  }

  const stillMatches = (match: Element, selector: string) => {
    try {
      return match.isConnected && match.matches(selector)
    } catch {
      return false
    }
  }

  // Re-checked on every scan: a page that redraws its container brings the padding back.
  const giveBackRoom = (entry: Handled) => {
    if (entry.barHeight <= 0 || (entry.unpadded?.isConnected && entry.unpadded.hasAttribute(unpaddedAttribute))) {
      return
    }
    const now = Date.now()
    if (entry.unpadded) {
      // The page redrew what was found before: looked for afresh.
      entry.unpadded = undefined
      entry.roomUntil = now + ROOM_SEARCH_MS
    }
    if (now > entry.roomUntil) {
      return
    }
    const padded = findPaddedAncestor(
      document.elementFromPoint(window.innerWidth / 2, entry.barHeight + 4),
      entry.barHeight,
      (element) => parseFloat(getComputedStyle(element).paddingTop) || 0,
    )
    padded?.setAttribute(unpaddedAttribute, '1')
    entry.unpadded = padded ?? undefined
  }

  const scan = () => {
    timer = undefined
    if (!isModeOn()) {
      releaseAll()
      return
    }

    // Give back what was hidden for a prompt that has gone.
    for (const [match, entry] of handled) {
      if (!stillMatches(match, entry.selector)) {
        release(entry)
        handled.delete(match)
      }
    }

    const now = Date.now()
    let retry = false
    const hide = (
      rule: { selectors: string[]; locksScroll: boolean },
      findTarget: (match: Element) => Element | null,
    ) => {
      for (const selector of rule.selectors) {
        try {
          for (const match of document.querySelectorAll(selector)) {
            const before = rejected.get(match)
            if (handled.has(match) || (before && before.count >= MAX_REJECTIONS)) {
              continue
            }
            if (before && now - before.at < REJECTED_RETRY_MS) {
              // Not yet, and not forgotten: the timer that is running may fire too early for this one.
              retry = true
              continue
            }
            const target = findTarget(match)
            if (!target) {
              const count = (before?.count ?? 0) + 1
              rejected.set(match, { count, at: now })
              retry ||= count < MAX_REJECTIONS
              continue
            }
            const { height, top } = target.getBoundingClientRect()
            target.setAttribute(hiddenAttribute, '1')
            handled.set(match, { selector, target, locksScroll: rule.locksScroll, barHeight: top <= 1 ? height : 0, roomUntil: now + ROOM_SEARCH_MS })
          }
        } catch {
          // Unsupported selector or unqueryable page: the other rules still run.
        }
      }
    }

    for (const rule of getAnonymousRules(hostname)) {
      const locksScroll = Boolean(rule.locksScroll)
      hide({ selectors: rule.overlays || [], locksScroll }, (match) => {
        const target = findOverlayTarget(match, isFloating)
        return target && (target.textContent?.length ?? 0) <= OVERLAY_MAX_TEXT ? target : null
      })
      // Clicked, not hidden: the page's own code must stop blocking the scroll.
      hide({ selectors: rule.dismiss || [], locksScroll }, (match) => {
        ;(match as HTMLElement).click()
        return match
      })
      hide({ selectors: rule.portals || [], locksScroll }, (match) =>
        findPortalTarget(match, (element) => element.textContent?.length ?? 0),
      )
    }

    for (const entry of handled.values()) {
      giveBackRoom(entry)
    }
    // Looked at again by itself: nothing on a quiet page would bring the next scan.
    if (retry && retryTimer === undefined) {
      retryTimer = setTimeout(() => {
        retryTimer = undefined
        schedule()
      }, REJECTED_RETRY_MS)
    }
    const root = document.documentElement
    if ([...handled.values()].some((entry) => entry.locksScroll)) {
      root.setAttribute(promptAttribute, '1')
    } else {
      root.removeAttribute(promptAttribute)
    }
  }

  const schedule = () => {
    // Pages of other profiles have nothing to do here.
    if (timer === undefined && (isModeOn() || handled.size)) {
      timer = setTimeout(scan, SCAN_DELAY_MS)
    }
  }

  // Always scanned: the setting is what turns the mode on or off.
  window.addEventListener(noraSettingsEvent, () => {
    if (timer === undefined) {
      timer = setTimeout(scan, SCAN_DELAY_MS)
    }
  })
  schedule()
  return schedule
}
