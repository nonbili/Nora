import { observable } from '@legendapp/state'
import { Asset } from 'expo-asset'

/**
 * Source of the Pinterest ad guard (`content/pinterest.ts`). Pinterest reads its
 * server-rendered first page and sends its first feed requests before the main content
 * script is in, so the guard rides in the document-start chain.
 */
export const pinterestGuardScript$ = observable('')

export const loadPinterestGuardScript = async () => {
  if (pinterestGuardScript$.get()) {
    return
  }
  const [{ localUri }] = await Asset.loadAsync(require('../assets/scripts/pinterest.bjs'))
  if (!localUri) {
    return
  }
  const res = await fetch(localUri)
  pinterestGuardScript$.set(await res.text())
}
