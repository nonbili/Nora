/**
 * What Instagram's embed page tells the page around it. It posts a few messages to its parent:
 * `LOADING` as it starts, then `MEASURE` with the height its content needs and `MOUNTED` once the
 * post is on screen. A page that cannot show the post -- one that says the link may be broken --
 * sends the first and never the others, which is how a card tells a post that did not load from one
 * that is still loading.
 */
export interface EmbedMessage {
  type: string
  height?: number
}

export function parseEmbedMessage(data: unknown): EmbedMessage | null {
  let value = data
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (!value || typeof value !== 'object') {
    return null
  }
  const { type, details } = value as { type?: unknown; details?: { height?: unknown } | null }
  if (typeof type !== 'string') {
    return null
  }
  const height = details?.height
  return { type, height: typeof height === 'number' && Number.isFinite(height) ? height : undefined }
}

/** Whether a message says the post is on screen. */
export const isEmbedLoaded = (message: EmbedMessage) => message.type === 'MEASURE' || message.type === 'MOUNTED'

const MIN_EMBED_HEIGHT = 200
const MAX_EMBED_HEIGHT = 1400

/** A height a page asks for, kept to what a card can sensibly be. */
export const clampEmbedHeight = (height: number) => Math.min(Math.max(Math.round(height), MIN_EMBED_HEIGHT), MAX_EMBED_HEIGHT)

/** How long a post gets to report that it is on screen, and how many times it is tried again. */
export const EMBED_LOAD_TIMEOUT_MS = 12_000
export const EMBED_AUTOMATIC_RETRIES = 1

/** When a post that said it is on screen is looked at once more, and the least height of a page that really shows one. */
export const EMBED_RENDER_CHECK_MS = 2500
export const MIN_RENDERED_EMBED_HEIGHT = 150
