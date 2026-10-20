import { mainClient } from '@/desktop/src/renderer/ipc/main'

let nextId = 1

/** An id for a request or download of the main process, which cancels them by it: one counter for both. */
export const nextWatchRequestId = () => nextId++

export const abortError = () => new DOMException('The operation was aborted.', 'AbortError')

/**
 * The requests of the feed, made by the main process: the window can't send a cookie or a
 * user agent of its own, nor read another site's answer. Answers are read as text.
 */
export const watchFetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
  const { signal } = init
  if (signal?.aborted) throw abortError()
  const id = nextWatchRequestId()
  const onAbort = () => void mainClient.abortWatchFetch(id)
  signal?.addEventListener('abort', onAbort)
  try {
    const answer = await mainClient.watchFetch(id, url, {
      method: init.method,
      headers: init.headers as Record<string, string> | undefined,
      body: typeof init.body === 'string' ? init.body : undefined,
    })
    if (signal?.aborted) throw abortError()
    const headers = new Map(Object.entries(answer.headers))
    // Not a Response, which would hide set-cookie, but what the feed reads of one.
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      url: answer.url,
      headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
      text: async () => answer.body,
      json: async () => JSON.parse(answer.body),
    } as unknown as Response
  } catch (e) {
    if (signal?.aborted) throw abortError()
    throw e
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}
