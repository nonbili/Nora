import { File, Paths } from 'expo-file-system'
import { shareAsync, isAvailableAsync } from 'expo-sharing'

function getMimeType(filename: string) {
  const name = filename.toLowerCase()
  if (name.endsWith('.csv')) {
    return 'text/csv'
  }
  return name.endsWith('.json') ? 'application/json' : 'text/plain'
}

export async function saveFile(filename: string, content: string) {
  if (!(await isAvailableAsync())) {
    throw new Error('Sharing is unavailable')
  }

  const file = new File(Paths.cache, filename)
  file.create({ overwrite: true })
  file.write(content)
  await shareAsync(file.uri, {
    mimeType: getMimeType(filename),
    UTI: filename.toLowerCase().endsWith('.json') ? 'public.json' : 'public.plain-text',
    dialogTitle: 'Save the file',
  })
}
