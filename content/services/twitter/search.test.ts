import { expect, test } from 'bun:test'
import { watchXSearchHistory } from './search'

test('search route watcher preserves state and arguments, restores methods when off', () => {
  const calls: unknown[][] = []
  const push = (...args: unknown[]) => { calls.push(args) }
  const replace = (...args: unknown[]) => { calls.push(args) }
  const history = { pushState: push, replaceState: replace } as unknown as History
  let changes = 0
  const stop = watchXSearchHistory(history, () => changes++)
  const state = { key: 'router' }
  history.pushState(state, '', '/search?q=cats')
  history.replaceState(state, '', '/search?q=cats&f=live')
  expect(changes).toBe(2)
  expect(calls).toEqual([[state, '', '/search?q=cats'], [state, '', '/search?q=cats&f=live']])
  stop()
  expect(history.pushState).toBe(push)
  expect(history.replaceState).toBe(replace)
})

test('search watcher does not clobber a newer site wrapper when disabled', () => {
  const history = { pushState() {}, replaceState() {} } as unknown as History
  const stop = watchXSearchHistory(history, () => {})
  const newer = () => {}
  history.pushState = newer
  stop()
  expect(history.pushState).toBe(newer)
})
