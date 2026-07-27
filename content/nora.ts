import { emit, waitUntil } from './utils'
import { getFacebookDownloadInfo, getTikTokDownloadUrl } from './download'
import { getService } from './services/manager'
import {
  createDefaultUserStylesSnapshot,
  type CustomUserScript,
  type UserStylesSnapshot,
} from '../lib/user-styles'
import { getBase64Payload } from '../lib/base64'

export const noraSettingsEvent = 'nora:settings'
export const noraUserStylesEvent = 'nora:user-styles'
export const noraUserScriptsEvent = 'nora:user-scripts'

const defaultSettings = {
  doubleTapToToggleHeader: false,
  videoEdgeLongPressTo2x: false,
  translateOnDoubleTap: false,
  xDefaultHomeTimeline: 'for-you',
  hideXHomeTimelineTabs: false,
  cosmeticCss: '',
}

let settings = { ...defaultSettings }
let userStyles = createDefaultUserStylesSnapshot()
let userScripts: CustomUserScript[] = []

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

// Keep recent object URLs around so a blob can be saved without `fetch()`, which
// fails once the page revokes the URL and is rejected outright by strict
// `connect-src` policies that don't allow `blob:` (e.g. grok.com).
const trackedBlobs = new Map<string, Blob>()
const maxTrackedBlobs = 8

let objectUrlsTracked = false

function trackObjectUrls() {
  const createObjectURL = URL.createObjectURL
  if (objectUrlsTracked || typeof createObjectURL !== 'function') {
    return
  }
  objectUrlsTracked = true
  URL.createObjectURL = function (object: Blob | MediaSource) {
    const url = createObjectURL.call(URL, object as Blob)
    // A revoked URL keeps working here, so entries are only dropped by the cap.
    if (object instanceof Blob) {
      trackedBlobs.set(url, object)
      while (trackedBlobs.size > maxTrackedBlobs) {
        trackedBlobs.delete(trackedBlobs.keys().next().value!)
      }
    }
    return url
  }
}

async function resolveBlob(url: string) {
  const tracked = trackedBlobs.get(url)
  if (tracked) {
    return tracked
  }
  const res = await fetch(url)
  return res.blob()
}

async function downloadBlob(url: string, fileName?: string, mimeType?: string) {
  try {
    const blob = await resolveBlob(url)
    const content = await blobToBase64(blob)
    if (!fileName) {
      fileName = url.split('/').at(-1)
    }
    emit('save-file', { content, fileName, mimeType: mimeType || blob.type || undefined })
  } catch (e) {
    console.error('[nora] failed to save blob', url, e)
  }
}

async function getVideoUrl() {
  const { hostname, pathname } = document.location
  const slugs = pathname.split('/')
  const src = await waitUntil(() => {
    const video = document.querySelector('video')
    return video?.currentSrc || video?.src
  })
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
      const igUrl = await waitUntil(() => {
        for (const script of [...document.scripts]) {
          const text = script.textContent
          if (!text || !text.includes('"video_versions":')) continue
          const m = text.match(/"video_versions":\[\{[^}]*?"url":"([^"]+)"/)
          if (m) {
            try {
              return JSON.parse(`"${m[1]}"`)
            } catch (e) {
              console.warn('[nora] failed to decode instagram url', e)
            }
          }
        }
      })
      if (igUrl) {
        emit('download', { url: igUrl, fileName })
        return
      }
      if (src?.startsWith('https://')) {
        emit('download', { url: src, fileName })
        return
      }
      if (src?.startsWith('blob:')) {
        await downloadBlob(src, fileName, 'video/mp4')
        return
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
  userScripts = userStyles.customScripts || []
  window.dispatchEvent(new CustomEvent(noraUserStylesEvent, { detail: userStyles }))
  window.dispatchEvent(new CustomEvent(noraUserScriptsEvent, { detail: userScripts }))
  return userStyles
}

function getUserScripts() {
  return userScripts
}

function setUserScripts(next?: CustomUserScript[]) {
  userScripts = Array.isArray(next) ? next : []
  window.dispatchEvent(new CustomEvent(noraUserScriptsEvent, { detail: userScripts }))
  return userScripts
}

export function initNora() {
  trackObjectUrls()
  return {
    getMeta,
    downloadBlob,
    getVideoUrl,
    getSettings,
    setSettings,
    getUserStyles,
    setUserStyles,
    getUserScripts,
    setUserScripts,
  }
}
