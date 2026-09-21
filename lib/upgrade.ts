export function parseStableVersion(version: string): number[] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version)
  return match && match[0] === version ? match.slice(1).map(Number) : null
}

export function isNewerVersion(candidate: string, current: string): boolean {
  const next = parseStableVersion(candidate)
  const installed = parseStableVersion(current)
  if (!next || !installed) return false
  for (let index = 0; index < 3; index++) {
    if (next[index] !== installed[index]) return next[index] > installed[index]
  }
  return false
}
