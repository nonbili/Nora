/** Fields which must never enter a settings sync document, including legacy remote documents. */
export const omitDeviceLocalSettings = <T extends { siteZoom?: unknown; proxyUsername?: unknown; proxyPassword?: unknown }>(value: T) => {
  const { siteZoom: _siteZoom, proxyUsername: _username, proxyPassword: _password, ...rest } = value
  return rest
}
