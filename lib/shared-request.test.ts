import { describe, expect, it } from 'bun:test'
import { SharedRequests } from './shared-request'

// A request that only ends when told to, or when it is cancelled.
const pending = () => {
  let finish: (value: string) => void = () => {}
  let cancelled = false
  const start = (signal: AbortSignal) =>
    new Promise<string>((resolve, reject) => {
      finish = resolve
      signal.addEventListener('abort', () => {
        cancelled = true
        reject(new Error('cancelled'))
      })
    })
  return { start, finish: (value: string) => finish(value), isCancelled: () => cancelled }
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('SharedRequests', () => {
  it('starts one request for callers of the same key', async () => {
    const requests = new SharedRequests<string>(10_000)
    const request = pending()
    let starts = 0
    const start = (signal: AbortSignal) => {
      starts += 1
      return request.start(signal)
    }
    const a = requests.run('k', start)
    const b = requests.run('k', start)
    await tick()
    request.finish('done')
    expect(await a).toBe('done')
    expect(await b).toBe('done')
    expect(starts).toBe(1)
    expect(requests.has('k')).toBe(false)
  })

  it('lets one caller stop waiting without cancelling it for another', async () => {
    const requests = new SharedRequests<string>(10_000)
    const request = pending()
    const leaving = new AbortController()
    const a = requests.run('k', request.start, leaving.signal)
    const b = requests.run('k', request.start)
    await tick()
    leaving.abort()
    await expect(a).rejects.toThrow('aborted')
    expect(request.isCancelled()).toBe(false)
    request.finish('done')
    expect(await b).toBe('done')
  })

  it('cancels the request when every caller has stopped waiting', async () => {
    const requests = new SharedRequests<string>(10_000)
    const request = pending()
    const first = new AbortController()
    const second = new AbortController()
    const a = requests.run('k', request.start, first.signal)
    const b = requests.run('k', request.start, second.signal)
    await tick()
    first.abort()
    second.abort()
    await expect(a).rejects.toThrow('aborted')
    await expect(b).rejects.toThrow('aborted')
    expect(request.isCancelled()).toBe(true)
  })

  it('cancels a request that outlives its own time limit', async () => {
    const requests = new SharedRequests<string>(20)
    const request = pending()
    await expect(requests.run('k', request.start)).rejects.toThrow('cancelled')
    expect(request.isCancelled()).toBe(true)
  })

  it('does not start for a caller that has already given up', async () => {
    const requests = new SharedRequests<string>(10_000)
    const controller = new AbortController()
    controller.abort()
    let started = false
    await expect(
      requests.run('k', async () => {
        started = true
        return 'x'
      }, controller.signal),
    ).rejects.toThrow('aborted')
    expect(started).toBe(false)
  })
})
