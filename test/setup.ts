import { mock } from 'bun:test'

// Native modules can't be loaded by bun (react-native's entrypoint uses Flow
// syntax), so state modules that persist via MMKV need these stubs.

mock.module('react-native-get-random-values', () => ({}))

mock.module('react-native', () => ({
  Platform: {
    OS: 'android',
    select: (obj: Record<string, unknown>) => obj?.android ?? obj?.native ?? obj?.default,
  },
  Alert: { alert: () => {} },
}))

// One shared backing store across every MMKV instance, so a test can seed persisted
// state (see seedPersistedState) before importing the state module that hydrates from it.
const mmkvStore = new Map<string, string>()

export const seedPersistedState = (key: string, value: unknown) => {
  mmkvStore.set(key, JSON.stringify(value))
}

export const clearPersistedState = () => {
  mmkvStore.clear()
}

class MMKVStub {
  private map = mmkvStore

  getString(key: string) {
    return this.map.get(key)
  }

  set(key: string, value: string) {
    this.map.set(key, value)
  }

  delete(key: string) {
    this.map.delete(key)
  }

  getAllKeys() {
    return [...this.map.keys()]
  }

  contains(key: string) {
    return this.map.has(key)
  }
}

mock.module('react-native-mmkv', () => ({ MMKV: MMKVStub }))
