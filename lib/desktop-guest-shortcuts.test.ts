import { describe, expect, mock, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import type { Input, WebContents } from 'electron'
import { attachGuestShortcuts } from '../desktop/src/main/lib/shortcuts'

function setup() {
  const guest = Object.assign(new EventEmitter(), { reload: mock(() => {}) })
  const forward = mock((_input: Input) => {})
  attachGuestShortcuts(guest as unknown as WebContents, forward)
  const press = (input: Partial<Input>) => {
    const event = { preventDefault: mock(() => {}) }
    guest.emit('before-input-event', event, { type: 'keyDown', ...input })
    return event
  }
  return { guest, forward, press }
}

describe('guest tab shortcuts', () => {
  test('forwards Ctrl/Cmd tab shortcuts and prevents guest defaults', () => {
    for (const modifier of ['control', 'meta']) {
      for (const key of ['t', 'T', 'w', '1', '9']) {
        const { forward, press } = setup()
        const input = { key, [modifier]: true, shift: key === 'T' }
        const event = press(input)
        expect(forward).toHaveBeenCalledWith({ type: 'keyDown', ...input })
        expect(event.preventDefault).toHaveBeenCalledTimes(1)
      }
    }
  })

  test('leaves ordinary typing, unrelated shortcuts and key-up events alone', () => {
    const { forward, press } = setup()
    for (const input of [
      { key: 't' },
      { key: 'c', control: true },
      { key: 't', control: true, type: 'keyUp' as const },
    ]) {
      expect(press(input).preventDefault).not.toHaveBeenCalled()
    }
    expect(forward).not.toHaveBeenCalled()
  })

  test('reloads the focused guest for Ctrl+R', () => {
    const { guest, forward, press } = setup()
    expect(press({ key: 'r', control: true }).preventDefault).toHaveBeenCalledTimes(1)
    expect(guest.reload).toHaveBeenCalledTimes(1)
    expect(forward).not.toHaveBeenCalled()
  })

  test('leaves AltGr and other Alt-modified input to the guest', () => {
    const { guest, forward, press } = setup()
    for (const key of ['t', 'w', 'r', '1', '9']) {
      expect(press({ key, control: true, alt: true }).preventDefault).not.toHaveBeenCalled()
    }
    expect(forward).not.toHaveBeenCalled()
    expect(guest.reload).not.toHaveBeenCalled()
  })
})
