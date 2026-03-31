import { emit, waitUntil } from './utils'
import { getFacebookDownloadInfo, getTikTokDownloadUrl } from './download'
import { getService } from './services/manager'
import { createDefaultUserStylesSnapshot, type UserStylesSnapshot } from '../lib/user-styles'
import { getBase64Payload } from '../lib/base64'

export const noraSettingsEvent = 'nora:settings'
export const noraUserStylesEvent = 'nora:user-styles'

const defaultSettings = {
  videoEdgeLongPressTo2x: false,
  xDefaultHomeTimeline: 'for-you',
  hideXHomeTimelineTabs: false,
}

let settings = { ...defaultSettings }
let userStyles = createDefaultUserStylesSnapshot()

function getMeta(url: string) {
  const icon = document.querySelector('link[rel*=icon]')?.getAttribute('href') || 'favicon.ico'
  return JSON.stringify({ title: document.title, icon: new URL(icon, document.location.href).href })
}

async function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onloadend = () => resolve(getBase64Payload(String(reader.result || '')))
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
  const src = await waitUntil(() => {
    const video = document.querySelector('video')
    return video?.currentSrc || video?.src
  })
  if (hostname == 'www.instagram.com' && !src) {
    return
  }
  const fileName = slugs.filter(Boolean).at(-1) + '.mp4'
  // if (src?.startsWith('https://')) {
  //   emit('download', { url: src, fileName })
  // } else if (!src || src.startsWith('blob:https://')) {
  switch (hostname) {
    case 'm.facebook.com':
    case 'www.facebook.com':
      const facebookNodes = [...document.querySelectorAll('[data-video-url]')]
      const dataVideoUrls = facebookNodes
        .map((node) => node.getAttribute('data-video-url'))
        .filter((value): value is string => !!value)
      const dataExtras = facebookNodes
        .map((node) => node.getAttribute('data-extra'))
        .filter((value): value is string => !!value)
      const htmlSources = [
        document.documentElement?.innerHTML || '',
        ...[...document.scripts].map((script) => script.textContent || ''),
      ].filter(Boolean)
      const info = getFacebookDownloadInfo(dataExtras, htmlSources, dataVideoUrls)
      if (info.hdVideoOnlyUrl && info.standardWithAudioUrl && info.hdVideoOnlyUrl !== info.standardWithAudioUrl) {
        emit('download-options', {
          fileName,
          options: [
            {
              label: 'HD video only',
              description: 'Higher quality, no audio',
              url: info.hdVideoOnlyUrl,
            },
            {
              label: 'Standard quality with audio',
              description: 'Lower quality, includes audio',
              url: info.standardWithAudioUrl,
            },
          ],
        })
        return
      }
      const url = info.standardWithAudioUrl || info.hdVideoOnlyUrl
      if (url) {
        emit('download', { url, fileName })
        return
      }
      break
    case 'www.instagram.com':
      const scripts = document.scripts
      for (const script of [...scripts]) {
        const text = script.textContent
        if (!text) continue
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
      if (service?.videoUrl) {
        emit('download', { url: service.videoUrl })
        return
      }
      break
    case 'www.tiktok.com':
      if (src?.startsWith('https://')) {
        await downloadBlob(src, fileName, 'video/mp4')
        return
      }
      const scriptSources = [
        ...[...document.scripts].map((script) => script.textContent || ''),
        ...[...document.querySelectorAll('script[type="application/json"]')].map((script) => script.textContent || ''),
      ].filter(Boolean)
      const tiktokUrl = getTikTokDownloadUrl(scriptSources)
      if (tiktokUrl) {
        await downloadBlob(tiktokUrl, fileName, 'video/mp4')
        return
      }
      break
  }
  emit('video-not-found', {})
  // }
}

function getSettings() {
  return settings
}

function setSettings(next: Partial<typeof defaultSettings> = {}) {
  settings = { ...settings, ...next }
  window.dispatchEvent(new CustomEvent(noraSettingsEvent, { detail: settings }))
  return settings
}

function getUserStyles() {
  return userStyles
}

function setUserStyles(next?: UserStylesSnapshot) {
  userStyles = next || createDefaultUserStylesSnapshot()
  window.dispatchEvent(new CustomEvent(noraUserStylesEvent, { detail: userStyles }))
  return userStyles
}

export function initNora() {
  return {
    getMeta,
    downloadBlob,
    getVideoUrl,
    getSettings,
    setSettings,
    getUserStyles,
    setUserStyles,
  }
}
