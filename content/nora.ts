import { emit, log, waitUntil } from './utils'
import { retry } from 'es-toolkit'

let reelObj: Blob
// let reelBuf: any

function intercept() {
  const winAppendBuffer = SourceBuffer.prototype.appendBuffer
  SourceBuffer.prototype.appendBuffer = function (buf) {
    const slugs = document.location.pathname.split('/')
    if (slugs.includes('reel')) {
      reelObj = new Blob([buf])
      console.log('- blob buf', reelObj.size)
      //
    }
    // return winAppendBuffer(buf)
    return winAppendBuffer.apply(this, [buf])
  }
}

function intercept0() {
  const winCreateObjectURL = URL.createObjectURL
  URL.createObjectURL = (obj) => {
    const objURL = winCreateObjectURL(obj)
    // const objURL2 = winCreateObjectURL(obj)
    const slugs = document.location.pathname.split('/')
    // if (document.location.href.startsWith('https://www.instagram.com/reel/')) {
    if (slugs.includes('reel')) {
      console.log('- createObjectURL', typeof obj, obj instanceof Blob)
      // ;(async () => {
      //   console.log('- url', objURL)
      //   const res = await fetch(objURL)
      //   // const res = await fetch(objURL.slice('blob:'.length))
      //   const blob = await res.blob()
      //   console.log('- blob', blob.size)
      //   reelObj = blob
      // })()
      var xhr = new XMLHttpRequest()
      xhr.open('GET', objURL, true)
      xhr.responseType = 'blob'
      xhr.onload = function (e) {
        if (this.status == 200) {
          const blob = this.response
          console.log('- blob', blob.size)
          reelObj = blob
        } else {
          console.log('- status', this.status)
        }
      }
      xhr.send()

      // reelObj = obj as Blob
    }
    // return objURL
    return winCreateObjectURL(obj)
  }
}

async function blobToBase64(blob: Blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = () => {
      if (typeof reader.result == 'string') {
        resolve(reader.result.split(',')[1])
      } else {
        resolve(reader.result)
      }
    }
    reader.readAsDataURL(blob)
  })
}

async function getVideosData() {
  const res = await fetch(document.location.href, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    },
  })
  const html = await res.text()
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const scripts = doc.scripts
  for (const script of [...scripts]) {
    const text = script.textContent
    const term = '"video_versions":'
    const start = text.indexOf(term)
    if (start > -1) {
      const end = text.indexOf(']', start)
      const slice = text.slice(start + term.length, end + 1)
      log('- text', slice, start, end, text)
      const videos = JSON.parse(slice)
      log('- text', videos)
      return videos
      // emit('download', { url: videos[0].url, fileName })
    }
  }
}

async function getVideoUrl() {
  const slugs = document.location.pathname.split('/')
  const src = await waitUntil(() => document.querySelector('video')?.src)
  log({ src }, slugs)
  if ((slugs[1] != 'reels' && slugs[2] != 'reel') || !src) {
    log('- early return')
    return
  }
  const fileName = slugs.filter(Boolean).at(-1) + '.mp4'
  if (src.startsWith('https://')) {
    emit('download', { url: src, fileName })
  } else if (src.startsWith('blob:https://')) {
    // const videos = await getVideosData()
    // log('- v len', videos?.length)
    // if (videos?.length) {
    //   emit('download', { url: videos[0].url })
    // }
    const scripts = document.scripts
    log('- scripts', scripts.length)
    for (const script of [...scripts]) {
      const text = script.textContent
      const term = '"video_versions":'
      const start = text.indexOf(term)
      if (start > -1) {
        const end = text.indexOf(']', start)
        const slice = text.slice(start + term.length, end + 1)
        console.log('- text', slice, start, end, text)
        const videos = JSON.parse(slice)
        console.log('- text', videos)
        emit('download', { url: videos[0].url, fileName })
      }
    }
  }
  // if (src.startsWith('blob:https://')) {
  //   const url = src.slice('blob:'.length)
  //   console.log({ url })
  //   const res = await fetch(url)
  //   const blob = await res.blob()
  //   const content = await blobToBase64(blob)
  //   const filename = document.location.pathname.split('/').filter(Boolean).at(-1) + '.mp4'
  //   emit('save-file', { url, filename, mimeType: 'video/mp4', content })
  //   const anchor = document.createElement('a')
  //   anchor.href = 'data:text/plain;base64,' + content
  //   anchor.download = filename
  //   console.log('- anchor', anchor)
  //   anchor.click()
  //   return url
  // }
}

export function initNora() {
  // intercept()
  return {
    getVideoUrl,
  }
}
