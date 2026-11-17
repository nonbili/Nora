import { pickDirectory } from './pick-directory'

export type DownloadDestination = 'downloads' | 'ask' | 'folder'

/** Where Android saves downloads: asking wins over a picked folder, which wins over Downloads. */
export const getDownloadDestination = (settings: {
  askDownloadDestination?: boolean
  downloadFolder?: string
}): DownloadDestination => (settings.askDownloadDestination ? 'ask' : settings.downloadFolder ? 'folder' : 'downloads')

/**
 * A readable name for a tree URI from the system folder picker, e.g.
 * `content://com.android.externalstorage.documents/tree/primary%3ADownload%2FNora` → `Download/Nora`.
 */
export const downloadFolderLabel = (uri: string) => {
  const treeId = uri.split('/tree/')[1]?.split('/')[0]
  if (!treeId) return uri
  let id: string
  try {
    id = decodeURIComponent(treeId)
  } catch {
    return uri
  }
  // Internal storage is "primary:"; an SD card keeps its volume id, which tells it apart.
  const path = id.startsWith('primary:') ? id.slice('primary:'.length) : id
  return path || id
}

/** Opens the system folder picker, starting in the current folder. Null when the user cancels. */
export const pickDownloadFolder = (current: string) => pickDirectory(current.startsWith('content://') ? current : null)
