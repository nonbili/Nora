import { emit, log, waitUntil } from './utils'
import { retry } from 'es-toolkit'

async function getVideoUrl() {
  const slugs = document.location.pathname.split('/')
  const src = await waitUntil(() => document.querySelector('video')?.src)
  if ((slugs[1] != 'reels' && slugs[2] != 'reel') || !src) {
    return
  }
  const fileName = slugs.filter(Boolean).at(-1) + '.mp4'
  if (src.startsWith('https://')) {
    emit('download', { url: src, fileName })
  } else if (src.startsWith('blob:https://')) {
    const scripts = document.scripts
    for (const script of [...scripts]) {
      const text = script.textContent
      const term = '"video_versions":'
      const start = text.indexOf(term)
      if (start > -1) {
        const end = text.indexOf(']', start)
        const slice = text.slice(start + term.length, end + 1)
        const videos = JSON.parse(slice)
        emit('download', { url: videos[0].url, fileName })
        return
      }
    }
    emit('video-not-found', {})
  }
}

export function initNora() {
  return {
    getVideoUrl,
  }
}
