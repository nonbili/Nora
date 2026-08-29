// Deep link fired by a home-screen shortcut. The tab id brings the shortcut back to the
// very tab it was pinned from; the url is the fallback for when that tab is long gone.
const TAB_SHORTCUT_PREFIX = 'nora://tab'

export interface TabShortcutTarget {
  id: string
  url: string
}

export function buildTabShortcutUrl({ id, url }: TabShortcutTarget) {
  return `${TAB_SHORTCUT_PREFIX}?id=${encodeURIComponent(id)}&url=${encodeURIComponent(url)}`
}

export function parseTabShortcutUrl(link: string): TabShortcutTarget | null {
  const [base, query] = link.split('?')
  if (base.toLowerCase() !== TAB_SHORTCUT_PREFIX || !query) {
    return null
  }

  try {
    const params = new URLSearchParams(query)
    const id = params.get('id')
    const url = params.get('url')
    if (!id || !url) {
      return null
    }
    return { id, url }
  } catch {
    return null
  }
}
