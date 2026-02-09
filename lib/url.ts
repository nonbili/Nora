const trackingParams = [
  // fb
  'referral_source',
  'surface_type',
  // instagram & reddit
  'utm_source',
  'utm_medium',
  'utm_name',
  'utm_term',
  'utm_content',
  // instagram
  'igsh',
  // threads
  'xmt',
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
