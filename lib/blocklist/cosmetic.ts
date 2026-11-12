function parseCosmeticRule(rule: string) {
  const separator = rule.includes('#@#') ? '#@#' : '##'
  const separatorIndex = rule.indexOf(separator)
  if (separatorIndex === -1) {
    return null
  }
  return {
    domains: rule.slice(0, separatorIndex),
    selector: rule.slice(separatorIndex + separator.length),
  }
}

function cosmeticRuleMatchesHost(domains: string, host: string) {
  const normalizedHost = host.toLowerCase()
  const candidates = normalizedHost.split('.').map((_, index, parts) => parts.slice(index).join('.'))
  if (!domains) {
    return true
  }

  const entries = domains
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
  if (!entries.length) {
    return true
  }

  const isMatch = (entry: string) => candidates.includes(entry)
  if (entries.some((entry) => entry.startsWith('~') && isMatch(entry.slice(1)))) {
    return false
  }

  const positiveEntries = entries.filter((entry) => !entry.startsWith('~'))
  return !positiveEntries.length || positiveEntries.some(isMatch)
}

export function buildCosmeticCss(host: string, cosmeticFilters: string[], cosmeticExceptions: string[]) {
  const exceptions = new Set(
    cosmeticExceptions
      .map(parseCosmeticRule)
      .filter((rule): rule is NonNullable<ReturnType<typeof parseCosmeticRule>> => !!rule)
      .filter((rule) => cosmeticRuleMatchesHost(rule.domains, host))
      .map((rule) => rule.selector),
  )

  return cosmeticFilters
    .map(parseCosmeticRule)
    .filter((rule): rule is NonNullable<ReturnType<typeof parseCosmeticRule>> => !!rule)
    .filter((rule) => cosmeticRuleMatchesHost(rule.domains, host))
    .filter((rule) => !exceptions.has(rule.selector))
    .map((rule) => `${rule.selector}{display:none!important;}`)
    .join('\n')
}

