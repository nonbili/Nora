export const hostHomes: Record<string, string> = {
  'bsky.app': 'bluesky',
  'm.facebook.com': 'facebook',
  'www.facebook.com': 'facebook-messenger',
  'www.instagram.com': 'instagram',
  'www.linkedin.com': 'linkedin',
  'chat.reddit.com': 'reddit',
  'www.reddit.com': 'reddit',
  'www.threads.com': 'threads',
  'www.tiktok.com': 'tiktok',
  'www.tumblr.com': 'tumblr',
  'm.vk.com': 'vk',
  'x.com': 'x',
}

const css = (raw: ArrayLike<string>, ...values: any[]) => String.raw({ raw }, ...values)

const styles: Record<string, string> = {
  base: css`
    ._nora_hidden_ {
      display: none !important;
    }

    img {
      pointer-events: initial !important;
    }
  `,

  facebook: css`
    .native-text {
      user-select: text !important;
      pointer-events: initial !important;
    }
  `,

  instagram: css`
    /* Open in app */
    ._acc8._abpk {
      display: none !important;
    }
    /* blocking div */
    ._aagw {
      pointer-events: none !important;
    }
  `,

  reddit: css`
    #xpromo-small-header,
    shreddit-ad-post,
    shreddit-comments-page-ad {
      display: none !important;
    }
  `,

  threads: css`
    /* Open in app */
    .x6s0dn4.x78zum5.xdt5ytf.x1mk1bxn.xaw7rza.xvc5jky {
      display: none !important;
    }
  `,

  tiktok: css`
    /* layout */
    div[class*='DivSideNavPlaceholderContainer'] {
      width: 3rem !important;
    }
    div[class*='DivSideNavContainer'] {
      width: 3rem !important;
    }
    main#main-content-homepage_hot {
      min-width: 0 !important;
    }
    div[class*='DivColumnListContainer'] {
      padding-inline-end: 0 !important;
    }
    section[class*='SectionMediaCardContainer'] {
      width: calc(100vw - 3rem);
      min-width: 0;
    }
    section[class*='SectionActionBarContainer'] {
      position: fixed !important;
      right: 0 !important;
      top: 0 !important;
      background: #ffffff33;
      border-radius: 12px;
      transform: scale(0.9);
    }
  `,

  x: css`
    /* Upgrade */
    [data-testid='super-upsell-UpsellButtonRenderProperties'] {
      display: none !important;
    }
  `,
}

export function injectCSS() {
  const style = document.createElement('style')
  const { host } = document.location
  const key = hostHomes[host]
  const content = styles.base + (styles[key] || '')
  style.type = 'text/css'
  style.textContent = content
  document.head.appendChild(style)
}
