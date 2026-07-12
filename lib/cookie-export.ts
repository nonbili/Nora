import NoraViewModule from '@/modules/nora-view'
import { mainClient } from '@/desktop/src/renderer/ipc/main'
import { isWeb } from '@/lib/utils'
import { formatCookiesTxt } from '@/lib/cookies'
import { File, Paths } from 'expo-file-system'
import * as Sharing from 'expo-sharing'

export async function exportCookiesTxt(profileId: string, url: string) {
  const cookieHeader = isWeb
    ? await mainClient.getCookies(profileId, url)
    : await NoraViewModule.getCookies(url, profileId)
  const contents = formatCookiesTxt(cookieHeader, url)
  if (!contents) return false

  if (isWeb) {
    const blobUrl = URL.createObjectURL(new Blob([contents], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = 'cookies.txt'
    link.click()
    URL.revokeObjectURL(blobUrl)
    return true
  }

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is unavailable')
  }
  const file = new File(Paths.cache, 'cookies.txt')
  file.write(contents)
  await Sharing.shareAsync(file.uri, {
    mimeType: 'text/plain',
    UTI: 'public.plain-text',
    dialogTitle: 'Export cookies.txt',
  })
  return true
}
