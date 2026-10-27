export const decodeEntities = (value: string) =>
  value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

export const metaContent = (html: string, property: string) => {
  const match = html.match(new RegExp(`<meta[^>]+property="${property}"[^>]+content="([^"]*)"`))
  return match ? decodeEntities(match[1]) : undefined
}

export const findWithKey = (value: any, key: string): any => {
  if (!value || typeof value !== 'object') return undefined
  if (!Array.isArray(value) && key in value) return value
  for (const child of Object.values(value)) {
    const found = findWithKey(child, key)
    if (found) return found
  }
  return undefined
}

/** The text of a post given as HTML: paragraphs and line breaks kept, a link as its address, made whole with `origin`. */
export const htmlToText = (html: string, origin = '') =>
  decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
      // A mention or a hashtag reads as it is shown; any other link is shortened, so its address is given.
      .replace(/<a\s([^>]*)>([\s\S]*?)<\/a>/gi, (_, attributes: string, inner: string) => {
        const href = attributes.match(/href="([^"]*)"/)?.[1]
        if (!href || /class="[^"]*\b(?:mention|hashtag)\b/.test(attributes)) return inner
        return href.startsWith('/') ? `${origin}${href}` : href
      })
      .replace(/<[^>]+>/g, ''),
  ).trim()

export const htmlAttribute = (tag: string, attribute: string) => {
  const value = tag.match(new RegExp(`\\s${attribute}="([^"]*)"`))?.[1]
  return value === undefined ? undefined : decodeEntities(value)
}

export const htmlTags = (html: string, tag: string) => html.match(new RegExp(`<${tag}\\s[^>]*>`, 'g')) || []
