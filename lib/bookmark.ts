import * as cheerio from 'cheerio/slim'
import { t } from 'i18next'
import { showToast } from './toast'
import { Bookmark, bookmarks$ } from '@/states/bookmarks'
import { Tab } from '@/states/tabs'

export async function getMeta(url: string) {
  const res = await fetch(url)
  const html = await res.text()
  const $ = cheerio.load(html)
  const title = $('title').text()
  const icon = $('link[rel*=icon]').attr('href') || 'favicon.ico'
  return { title, icon: new URL(icon, url).href }
}

export const addBookmark = (tab?: Tab) => {
  if (tab?.url) {
    bookmarks$.addBookmark({
      url: tab.url,
      title: tab.title || tab.url,
      icon: tab.icon || '',
    })
    showToast(t('toast.pinned'))
  }
}
