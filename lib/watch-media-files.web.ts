import { mainClient } from '@/desktop/src/renderer/ipc/main'
import { abortError, nextWatchRequestId } from '@/lib/watch-fetch.web'
import { WATCH_MEDIA_FILES_CHANNEL, WATCH_MEDIA_SCHEME } from '../desktop/src/main/ipc/constants'

/** Where the feed keeps its photos and videos on desktop: a folder of the main process, served to the window. */

const call = (op: 'exists' | 'delete' | 'list' | 'clear', name?: string) => {
  const answer = window.electron?.ipcRenderer?.sendSync(WATCH_MEDIA_FILES_CHANNEL, op, name)
  if (!answer) throw new Error('no media files outside the desktop app')
  if (answer.error) throw new Error(answer.error)
  return answer.result
}

export const mediaFileUri = (name: string) => `${WATCH_MEDIA_SCHEME}://files/${encodeURIComponent(name)}`

export const mediaFileExists = (name: string): boolean => call('exists', name)

/** Downloads a file to keep; a failed or cancelled one leaves nothing behind. */
export const downloadMediaFile = async (
  url: string,
  name: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<{ uri: string; bytes: number }> => {
  if (signal?.aborted) throw abortError()
  const id = nextWatchRequestId()
  const onAbort = () => void mainClient.abortWatchFetch(id)
  signal?.addEventListener('abort', onAbort)
  try {
    return await mainClient.downloadWatchMedia(id, url, name, headers)
  } catch (e) {
    if (signal?.aborted) throw abortError()
    throw e
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}

export const deleteMediaFile = (name: string) => void call('delete', name)

export const listMediaFiles = (): string[] => call('list')

export const clearMediaFiles = () => void call('clear')
