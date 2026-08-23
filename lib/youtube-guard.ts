import { observable } from '@legendapp/state'
import { Asset } from 'expo-asset'

/**
 * Source of the YouTube ad guard (`content/youtube.ts`). It has to be injected
 * at document start and into every frame -- an embedded player is an iframe
 * with its own player response -- so it ships as its own bundle instead of
 * riding along with the main content script.
 */
export const youTubeGuardScript$ = observable('')

export const loadYouTubeGuardScript = async () => {
  if (youTubeGuardScript$.get()) {
    return
  }
  const [{ localUri }] = await Asset.loadAsync(require('../assets/scripts/youtube.bjs'))
  if (!localUri) {
    return
  }
  const res = await fetch(localUri)
  youTubeGuardScript$.set(await res.text())
}

/**
 * The native views take a single document-start script, so the guards are
 * concatenated. Each one is self-contained and wrapped in its own try/catch, but
 * they are still separated by a newline and a semicolon so a bundle that ends in
 * an expression can't swallow the next one.
 */
export const composeDocumentStartScript = (...scripts: (string | false | null | undefined)[]) =>
  scripts.filter(Boolean).join('\n;\n')
