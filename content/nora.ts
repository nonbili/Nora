import { emit, log, waitUntil } from './utils'
import { delay, retry } from 'es-toolkit'
import { isDownloadable } from './download'
import { getService } from './services/manager'

function getMeta(url: string) {
  const icon = document.querySelector('link[rel*=icon]')?.getAttribute('href') || 'favicon.ico'
  return { title: document.title, icon: new URL(icon, document.location.href).href }
}

async function blobToBase64(blob: Blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onloadend = () => resolve(reader.result)
    reader.readAsDataURL(blob)
  })
}

async function downloadBlob(url: string, fileName?: string, mimeType?: string) {
  const res = await fetch(url)
  const blob = await res.blob()
  const content = await blobToBase64(blob)
  if (!fileName) {
    fileName = url.split('/').at(-1)
  }
  emit('save-file', { content, fileName, mimeType })
}

async function getVideoUrl() {
  const { hostname, pathname } = document.location
  const slugs = pathname.split('/')
  const canDownload = isDownloadable(document.location.href)
  log('- canDownload', canDownload, document.location.href)
  if (!canDownload) {
    return
  }
  const src = await waitUntil(() => document.querySelector('video')?.src)
  if (hostname == 'www.instagram.com' && !src) {
    return
  }
  const fileName = slugs.filter(Boolean).at(-1) + '.mp4'
  if (src?.startsWith('https://')) {
    emit('download', { url: src, fileName })
  } else if (!src || src.startsWith('blob:https://')) {
    switch (hostname) {
      case 'm.facebook.com':
        const url = document.querySelector('[data-video-url]')?.getAttribute('data-video-url')
        if (url) {
          emit('download', { url, fileName })
          return
        }
        break
      case 'www.instagram.com':
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
        break
      case 'x.com':
        const service = getService(document.location.href)
        log('-- x.com videoUrl', service?.videoUrl)
        if (service?.videoUrl) {
          emit('download', { url: service.videoUrl })
        }
        break
    }
    emit('video-not-found', {})
  }
}

export function initNora() {
  return {
    getMeta,
    downloadBlob,
    getVideoUrl,
  }
}
