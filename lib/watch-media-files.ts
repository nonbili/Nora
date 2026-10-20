import { Directory, File, Paths } from 'expo-file-system'

/** Where the feed keeps its photos and videos, by name; on desktop the main process keeps them. */

let directory: Directory | undefined
const mediaDirectory = () => {
  if (!directory) {
    directory = new Directory(Paths.document, 'watch-media')
    if (!directory.exists) {
      directory.create({ intermediates: true, idempotent: true })
    }
  }
  return directory
}

export const mediaFileUri = (name: string) => new File(mediaDirectory(), name).uri

export const mediaFileExists = (name: string) => new File(mediaDirectory(), name).exists

/** Downloads a file to keep; a failed or cancelled one leaves nothing behind. */
export const downloadMediaFile = async (
  url: string,
  name: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<{ uri: string; bytes: number }> => {
  const destination = new File(mediaDirectory(), name)
  try {
    const file = await File.downloadFileAsync(url, destination, { idempotent: true, headers, signal })
    return { uri: file.uri, bytes: file.size || 0 }
  } catch (e) {
    // A failed or cancelled download can leave part of the file behind, which nothing counts.
    try {
      if (destination.exists) destination.delete()
    } catch {}
    throw e
  }
}

export const deleteMediaFile = (name: string) => {
  const file = new File(mediaDirectory(), name)
  if (file.exists) file.delete()
}

export const listMediaFiles = (): string[] =>
  mediaDirectory()
    .list()
    .filter((entry): entry is File => entry instanceof File)
    .map((entry) => entry.name)

export const clearMediaFiles = () => {
  const dir = mediaDirectory()
  if (dir.exists) dir.delete()
  directory = undefined
}
