import fs from 'fs/promises'
import * as cheerio from 'cheerio'

// const res = await fetch('http://www.youtube.com/channel/UC-QVOEJcRTmqXTEwUFbPRLA')
// await fs.writeFile('snippets/channel.html', await res.text())
// const html = await fs.readFile('snippets/channel.html', 'utf8')

// const res = await fetch('https://m.youtube.com/watch?v=alcuJvgPQlo')
// await fs.writeFile('snippets/video.html', await res.text())
const html = await fs.readFile('snippets/video.html', 'utf8')

const $ = cheerio.load(html)
// const image = $('meta[property="og:image"]').attr('content')
// console.log(image)
const title = $('meta[property="og:title"]').attr('content')
console.log(title)
