import NoraViewModule from '@/modules/nora-view'
import { mainClient } from '@/desktop/src/renderer/ipc/main'
import { isWeb } from '@/lib/utils'
import { formatCookiesTxt, formatProfileCookiesTxt } from '@/lib/cookies'
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'

async function shareCookiesTxt(contents: string, fileName: string) {
  if (isWeb) {
    const blobUrl = URL.createObjectURL(new Blob([contents], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = fileName
    link.click()
    URL.revokeObjectURL(blobUrl)
    return
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is unavailable')
  }
  const file = new File(Paths.cache, fileName)
  file.write(contents)
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/plain',
    UTI: 'public.plain-text',
    dialogTitle: 'Export cookies.txt',
  })
}

export async function exportCookiesTxt(profileId: string, url: string) {
  const cookieHeader = isWeb
    ? await mainClient.getCookies(profileId, url)
    : await NoraViewModule.getCookies(url, profileId)
  const contents = formatCookiesTxt(cookieHeader, url)
  if (!contents) return false

  await shareCookiesTxt(contents, 'cookies.txt')
  return true
}

const safeFilePart = (value: string) =>
  value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'profile'

export async function exportProfileCookiesTxt(profileId: string, profileName: string) {
  const cookies = isWeb
    ? await mainClient.getProfileCookies(profileId)
    : await NoraViewModule.getProfileCookies(profileId)
  const contents = formatProfileCookiesTxt(cookies)
  if (!contents) return false

  await shareCookiesTxt(contents, `cookies-${safeFilePart(profileName)}.txt`)
  return true
}
