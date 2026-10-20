import { describe, expect, it } from 'bun:test'
import { observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { createMMKV } from 'react-native-mmkv'

const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0))

// Legend saves a change a few microtasks after it is made. Before the patch, a store with nothing
// saved yet shared its value with the plugin's copy, so a save landing after a newer change wrote
// the older value back into the store, unseen.
describe('persisted store', () => {
  it('keeps a change made before the one before it was saved', async () => {
    const store$ = observable({ list: [] as { id: string }[] })
    syncObservable(store$, { persist: { name: 'persist-test', plugin: ObservablePersistMMKV } })
    await nextTask()

    store$.list.push({ id: 'a' })
    await Promise.resolve()
    store$.list.set([{ id: 'b' }])
    await nextTask()

    expect(store$.list.peek()).toEqual([{ id: 'b' }])
    expect(JSON.parse(createMMKV().getString('persist-test')!)).toEqual({ list: [{ id: 'b' }] })
  })
})
