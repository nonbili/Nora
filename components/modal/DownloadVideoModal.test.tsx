import { NoraViewMock } from '../../test/component'
import { afterAll, describe, expect, it, mock, spyOn } from 'bun:test'
import React, { act } from 'react'
import TestRenderer from 'react-test-renderer'

let props: any
let executions = 0
const handle = {
  loadUrl() {},
  executeJavaScript() {
    executions++
    return Promise.resolve()
  },
}
const View = React.forwardRef((next: any, ref) => {
  props = next
  React.useImperativeHandle(ref, () => handle, [])
  return null
})
View.displayName = 'DownloadWebviewMock'
mock.module('@/modules/nora-view', () => ({ default: View, NoraView: View }))
afterAll(() => {
  mock.module('@/modules/nora-view', () => ({ default: NoraViewMock, NoraView: NoraViewMock }))
})
const { DownloadVideoModal } = await import('./DownloadVideoModal')
const { ui$ } = await import('@/states/ui')

const message = (type: string, data = {}) =>
  act(async () => {
    await props.onMessage({ nativeEvent: { payload: { type, data } } })
  })

describe('download parsing lifecycle', () => {
  it('leaves Parsing after the deadline if the webview never responds', async () => {
    const original = globalThis.setTimeout
    let expire: (() => void) | undefined
    const timer = spyOn(globalThis, 'setTimeout').mockImplementation(((fn: any, ms: number, ...args: any[]) => {
      if (ms === 20000) {
        expire = fn
        return original(() => {}, 60000)
      }
      return original(fn, ms, ...args)
    }) as any)
    let renderer!: TestRenderer.ReactTestRenderer
    try {
      ui$.downloadVideoModalUrl.set('https://m.facebook.com/reel/123/')
      await act(async () => {
        renderer = TestRenderer.create(<DownloadVideoModal contentJs="test" />)
      })
      await act(async () => {
        await props.onLoad({ nativeEvent: { url: 'https://m.facebook.com/reel/123/' } })
      })
      expect(JSON.stringify(renderer.toJSON())).toContain('Parsing...')
      await act(async () => {
        expire!()
      })
      expect(JSON.stringify(renderer.toJSON())).toContain('Failed to find video url')
    } finally {
      await act(async () => {
        renderer?.unmount()
        ui$.downloadVideoModalUrl.set('')
      })
      timer.mockRestore()
    }
  })
  it('retries when injection is late and does not overwrite a settled result on history updates', async () => {
    ui$.downloadVideoModalUrl.set('https://m.facebook.com/reel/123/')
    executions = 0
    let renderer!: TestRenderer.ReactTestRenderer
    await act(async () => {
      renderer = TestRenderer.create(<DownloadVideoModal contentJs="test" />)
    })
    await act(async () => {
      await props.onLoad({ nativeEvent: { url: 'https://m.facebook.com/reel/123/' } })
    })
    expect(executions).toBe(1)
    await message('video-not-found', { reason: 'nora-not-ready' })
    await message('onload')
    expect(executions).toBe(2)
    await message('video-not-found')
    const before = JSON.stringify(renderer.toJSON())
    expect(before).toContain('Failed to find video url')
    await act(async () => {
      await props.onLoad({ nativeEvent: { url: 'https://m.facebook.com/reel/123/?history=1' } })
    })
    // History changes must not keep restarting a genuine failed parse.
    expect(executions).toBe(2)
    await message('download-options', {
      fileName: '123.mp4',
      options: [{ label: 'Standard', description: 'With audio', url: 'https://example.com/video.mp4' }],
    })
    await act(async () => {
      await props.onLoad({ nativeEvent: { url: 'https://m.facebook.com/reel/123/?history=2' } })
    })
    expect(JSON.stringify(renderer.toJSON())).toContain('Choose download quality')
    expect(executions).toBe(2)
    await act(async () => {
      renderer.unmount()
      ui$.downloadVideoModalUrl.set('')
    })
  })
})
