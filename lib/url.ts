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
    trackingParams.forEach((x) => url.searchParams.delete(x))
    return url.href
  } catch (e) {
    return v
  }
}
