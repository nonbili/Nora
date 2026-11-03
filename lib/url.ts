const trackingParams = [
  // fb
  'fbclid',
  'mibextid',
  'referral_source',
  'surface_type',
  // instagram & reddit
  'utm_source',
  'utm_medium',
  'utm_name',
  'utm_term',
  'utm_content',
  // reddit
  'share_id',
  'rdt',
  // instagram
  'igsh',
  'igshid',
  // threads
  'xmt',
  // tiktok
  '_t',
  '_r',
  // twitter/x
  'twclid',
  // google
  'gclid',
  'gbraid',
  'wbraid',
  // microsoft/bing
  'msclkid',
  // mailchimp
  'mc_cid',
  'mc_eid',
  // hubspot
  '_hsenc',
  '_hsmi',
  // yandex
  'yclid',
  // generic
  'utm_id',
  'utm_campaign',
  'utm_referrer',
  'ref_src',
  'ref_url',
]

export function removeTrackingParams(v: string) {
  try {
    const url = new URL(v)
    let removed = false
    const remove = (key: string) => {
      if (url.searchParams.has(key)) {
        url.searchParams.delete(key)
        removed = true
      }
    }
    trackingParams.forEach(remove)
    // X adds account/share tokens to post links. Restrict these short names to
    // actual tweet URLs; they can have functional meanings on other pages.
    if (
      ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com', 'mobile.twitter.com'].includes(url.hostname) &&
      /^\/(?:[^/]+\/status|i\/web\/status)\/\d+(?:\/(?:photo|video)\/\d+)?\/?$/.test(url.pathname)
    ) {
      for (const key of ['a', 's', 't']) remove(key)
    }
    return removed ? url.href : v
  } catch {
    return v
  }
}
