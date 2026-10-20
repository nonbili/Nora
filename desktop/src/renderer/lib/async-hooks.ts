// expo-font's web build imports this for server rendering only, and throws before using it in a
// browser; the window has no node:async_hooks to bundle.
export class AsyncLocalStorage<T> {
  getStore(): T | undefined {
    return undefined
  }

  run<R>(_store: T, callback: () => R): R {
    return callback()
  }
}
