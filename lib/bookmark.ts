import * as cheerio from 'cheerio/slim'

export async function getMeta(url: string) {
  const res = await fetch(url)
  const html = await res.text()
  const $ = cheerio.load(html)
  const title = $('title').text()
  const icon = $('link[rel*=icon]').attr('href') || 'favicon.ico'
  return { title, icon: new URL(icon, url).href }
}
