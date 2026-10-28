import { expect, it } from 'bun:test'
import { getTabIdByWebContentsId, isViewNotFoundError, registerTabWebview } from './webview'

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

it('recognizes a stale native view rejection in debug and minified release builds', () => {
  const message =
    "Call to function 'NoraView.loadUrl' has been rejected.\n→ Caused by: The 1st argument cannot be cast to type class expo.modules.noraview.NoraView (received class java.lang.Integer)\n→ Caused by: Unable to find the class expo.modules.noraview.NoraView view with tag 840"
  expect(isViewNotFoundError({ code: 'ERR_S4', message })).toBe(true)
  expect(isViewNotFoundError({ code: 'ERR_FUNCTION_CALL', message })).toBe(true)
  expect(isViewNotFoundError({ code: 'ERR_VIEW_NOT_FOUND' })).toBe(true)
  expect(isViewNotFoundError({ message: "Unable to find the 'NoraView' view with tag '840'" })).toBe(true)
  expect(isViewNotFoundError({ code: 'ERR_S4', message: 'net::ERR_FAILED' })).toBe(false)
  expect(isViewNotFoundError(undefined)).toBe(false)
})
