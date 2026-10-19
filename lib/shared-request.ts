/**
 * Requests that several callers can wait on at once, as the same photo asked for by the gallery
 * and by a prefetch run. Each caller waits only as long as its own signal allows; the request is
 * cancelled when every caller has stopped waiting, and in any case after its own time limit.
 */

interface Shared<T> {
  promise: Promise<T>
  controller: AbortController
  waiters: number
}

export class AbortedError extends Error {
  constructor() {
    super('aborted')
    this.name = 'AbortError'
  }
}

export class SharedRequests<T> {
  private requests = new Map<string, Shared<T>>()

  constructor(private timeoutMs: number) {}

  has(key: string) {
    return this.requests.has(key)
  }

  /** Waits for the request of this key, starting it when there is none. */
  run(key: string, start: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(new AbortedError())
    let shared = this.requests.get(key)
    if (!shared) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), this.timeoutMs)
      const promise = Promise.resolve()
        .then(() => start(controller.signal))
        .finally(() => {
          clearTimeout(timer)
          if (this.requests.get(key) === created) this.requests.delete(key)
        })
      const created: Shared<T> = { promise, controller, waiters: 0 }
      shared = created
      this.requests.set(key, created)
    }
    const current = shared
    current.waiters += 1
    return new Promise<T>((resolve, reject) => {
      let settled = false
      const leave = () => {
        settled = true
        current.waiters -= 1
        signal?.removeEventListener('abort', onAbort)
      }
      const onAbort = () => {
        if (settled) return
        leave()
        if (current.waiters <= 0) current.controller.abort()
        reject(new AbortedError())
      }
      signal?.addEventListener('abort', onAbort)
      current.promise.then(
        (value) => {
          if (settled) return
          leave()
          resolve(value)
        },
        (error) => {
          if (settled) return
          leave()
          reject(error)
        },
      )
    })
  }
}
