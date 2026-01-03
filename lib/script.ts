import { Asset } from 'expo-asset'

let scriptPromise: Promise<string> | null = null

export function getScriptContent(): Promise<string> {
  if (scriptPromise) {
    return scriptPromise
  }

  // Cache the promise to ensure the script is only fetched once.
  // This prevents redundant work if the component using this script
  // re-mounts multiple times.
  scriptPromise = (async () => {
    try {
      const [{ localUri }] = await Asset.loadAsync(require('../assets/scripts/main.bjs'))
      if (localUri) {
        const response = await fetch(localUri)
        const content = await response.text()
        return content
      }
    }
    catch (error) {
      console.error('Failed to load script:', error)
    }
    return ''
  })()

  return scriptPromise
}
