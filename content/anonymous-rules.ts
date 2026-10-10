import { isBlocklistExcludedHost } from '../lib/blocklist/policy'

/**
 * What the anonymous mode removes, per site. Plain data, so it is cheap to amend: each selector is
 * applied on its own, and one that stops matching or parsing only loses itself.
 * Only prompts that block reading public content belong here, never a captcha or a bot check.
 * Each rule notes when it was seen working; a selector not seen on a real page does not go in.
 */
export interface AnonymousRule {
  /** Hosts the rule applies to, with their subdomains. */
  hosts: string[]
  /** Hidden outright with CSS, one rule per selector. */
  hide?: string[]
  /** Found by what is inside: the outermost fixed or sticky container around a match is hidden. */
  overlays?: string[]
  /** Like `overlays`, for a prompt mounted directly under the body; skipped if that holds much besides it. */
  portals?: string[]
  /** The prompt's own close button, clicked once. For dialogs that keep cancelling scroll while "open". */
  dismiss?: string[]
  /** The prompt locks the page's scrolling; set only for rules seen doing so. */
  locksScroll?: boolean
}

export const anonymousRules: AnonymousRule[] = [
  {
    // Seen 2026-10-08 on a logged-out public profile, mobile layout.
    hosts: ['x.com'],
    hide: [
      // "Get the full app experience" sheet and its backdrop.
      '[data-interaction="app-store-obstruction"]',
    ],
    // Hiding is not enough: while the sheet counts as open, the page cancels every scroll.
    dismiss: ['[data-interaction="app-store-obstruction"] button[aria-label="Dismiss"]'],
  },
  {
    // Seen 2026-10-08 on m.facebook.com, logged-out public page; the sheet also
    // locks scrolling on the body.
    hosts: ['facebook.com'],
    overlays: ['div[role="dialog"]:has(a[href*="/login"])'],
    locksScroll: true,
  },
  {
    // Seen 2026-10-08 on a logged-out public profile, mobile layout: "See full
    // profile in the app".
    hosts: ['instagram.com'],
    // Embed pages only (readable class names), seen 2026-10-09: the "View more on Instagram" row, which leads to a page
    // asking for the app, the footer with the comment field (commenting needs an account) and the logo link, and the
    // hover card's root, a white link to the profile that lies over the bottom of the picture on a phone.
    hide: ['.PrimaryCTA', '.Footer', '.HoverCardRoot'],
    overlays: [
      'div[role="dialog"]:has(a[href^="intent://"])',
      // The top bar with "Log in" and "Open app".
      'header:has(a[href^="/accounts/login"]):has(a[href^="intent://"])',
    ],
  },
  {
    // Seen 2026-10-08, logged-out profile, mobile. No stable hook: told apart as a modal of only text and buttons.
    hosts: ['threads.com'],
    // Not dialogs with media, links, fields, frames (a check), forms or alerts.
    portals: [
      'div[role="dialog"][aria-modal="true"]:not(:has(img, video, a, input, textarea, iframe, canvas, form, [role="alertdialog"]))',
    ],
  },
  {
    // Seen 2026-10-08, logged-out blog, mobile: the bottom bar, found by its button label (English only).
    hosts: ['tumblr.com'],
    overlays: ['button[aria-label="Sign up"]'],
  },
]

export function getAnonymousRules(host: string, rules: AnonymousRule[] = anonymousRules) {
  return rules.filter((rule) => isBlocklistExcludedHost(host, rule.hosts))
}
