import { expect, it } from 'bun:test'
import { getTabIdByWebContentsId, registerTabWebview } from './webview'

it('resolves the source guest even when another guest has detached', () => {
  registerTabWebview('detached', { getWebContentsId: () => { throw new Error('detached') } })
  registerTabWebview('source', { getWebContentsId: () => 42 })
  try {
    expect(getTabIdByWebContentsId(42)).toBe('source')
    expect(getTabIdByWebContentsId(99)).toBeUndefined()
    registerTabWebview('source', null)
    expect(getTabIdByWebContentsId(42)).toBeUndefined()
  } finally {
    registerTabWebview('detached', null)
    registerTabWebview('source', null)
  }
})
