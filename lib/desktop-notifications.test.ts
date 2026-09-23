import { describe, expect, mock, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import { runInNewContext } from 'node:vm'
import type { BrowserWindow, WebContents } from 'electron'
import { attachGuestNotifications } from '../desktop/src/main/lib/notifications'
import { observeNotificationClicks, installNotificationClickHandler, setupNotificationClicks } from '../desktop/src/preload/notifications'

describe('desktop notification clicks', () => {
  test('returns the native object without copying data or replacing events', () => {
    class NativeNotification extends EventTarget {
      static permission = 'granted'
      static instances: NativeNotification[] = []
      close = mock(() => {})
      constructor(private label: string, public options: unknown) {
        super()
        NativeNotification.instances.push(this)
      }
      get title() { return this.label }
      get data() { throw new Error('must not read data') }
    }
    const window = Object.assign(new EventTarget(), {
      Notification: NativeNotification as unknown as typeof Notification,
    })
    runInNewContext(`(${installNotificationClickHandler.toString()})()`, { window, Event, EventTarget })
    const signal = mock(() => {})
    window.addEventListener('nora-notification-click', signal)
    const data = { callback: () => {} }
    const options = { body: 'Hello', data }
    const notification = new window.Notification('Message', options)
    const native = NativeNotification.instances[0]
    expect(notification).toBeInstanceOf(NativeNotification)
    expect(notification.title).toBe('Message')
    expect(notification).toBe(native)
    expect(native.options).toBe(options)
    expect(window.Notification.permission).toBe('granted')
    expect(signal).not.toHaveBeenCalled()
    const siteClick = mock(() => {})
    notification.addEventListener('click', siteClick)
    const click = new Event('click')
    native.dispatchEvent(click)
    expect(siteClick).toHaveBeenCalledWith(click)
    expect(signal).toHaveBeenCalledTimes(1)
    notification.close()
    expect(native.close).toHaveBeenCalledTimes(1)
  })

  test('isolated observation only activates with user activation', () => {
    const window = new EventTarget()
    const navigator = { userActivation: { isActive: false } }
    const activate = mock(() => {})
    runInNewContext(`(${observeNotificationClicks.toString()})(activate)`, { window, navigator, activate })
    window.dispatchEvent(new Event('nora-notification-click'))
    expect(activate).not.toHaveBeenCalled()
    navigator.userActivation.isActive = true
    window.dispatchEvent(new Event('nora-notification-click'))
    expect(activate).toHaveBeenCalledTimes(1)
  })

  test('setup contains synchronous and asynchronous errors', async () => {
    const report = mock(() => {})
    const inject = mock(async () => {})
    setupNotificationClicks(() => { throw new Error('observe failed') }, inject, report)
    expect(inject).not.toHaveBeenCalled()
    setupNotificationClicks(() => {}, () => { throw new Error('inject failed') }, report)
    setupNotificationClicks(() => {}, () => Promise.reject(new Error('async failure')), report)
    await Promise.resolve()
    expect(report).toHaveBeenCalledTimes(3)
  })

  test('restores and focuses the window and activates the sending guest', () => {
    for (const minimized of [true, false]) {
      const mainFrame = {}
      const guest = Object.assign(new EventEmitter(), { id: 42, mainFrame, isDestroyed: () => false })
      const owner = {
        isDestroyed: () => false,
        isMinimized: () => minimized,
        restore: mock(() => {}),
        show: mock(() => {}),
        focus: mock(() => {}),
      }
      const activateTab = mock((_id: number) => {})
      attachGuestNotifications(guest as unknown as WebContents, owner as unknown as BrowserWindow, activateTab)
      guest.emit('ipc-message', {}, 'unrelated')
      expect(owner.show).not.toHaveBeenCalled()
      guest.emit('ipc-message', {}, 'notification-click')
      guest.emit('ipc-message', { senderFrame: {} }, 'notification-click')
      expect(owner.show).not.toHaveBeenCalled()
      guest.emit('ipc-message', { senderFrame: mainFrame }, 'notification-click', 999)
      expect(owner.restore).toHaveBeenCalledTimes(minimized ? 1 : 0)
      expect(owner.show).toHaveBeenCalledTimes(1)
      expect(owner.focus).toHaveBeenCalledTimes(1)
      expect(activateTab).toHaveBeenCalledWith(42)
    }
  })
})
