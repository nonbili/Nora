import { mock } from 'bun:test'
import React from 'react'

// Mocks for the leaves of the component graph that a tab-lifecycle test does not care
// about, but that drag native modules in on import. Importing this module registers them,
// so a test file must import it before it (dynamically) imports the component under test.

// Flow-typed react-native internals that bun cannot parse, reached through icon and
// gesture libraries in the graph.
mock.module('react-native/Libraries/Utilities/codegenNativeComponent', () => ({ default: () => null }))
mock.module('react-native/Libraries/Image/resolveAssetSource', () => ({ default: (source: unknown) => source }))

mock.module('@/desktop/src/renderer/lib/shortcuts', () => ({ handleShortcuts: () => {} }))
mock.module('@react-native-vector-icons/material-icons', () => ({ default: () => null }))
mock.module('@/lib/download-notifications', () => ({ ensureDownloadNotificationPermission: async () => true }))
mock.module('@/components/service/Services', () => ({
  ServiceIcon: () => null,
  services: [],
  getService: () => undefined,
}))
mock.module('@/components/menu/NouContextMenu', () => ({
  NouContextMenu: ({ children }: { children: React.ReactNode }) => children,
}))
// Pulls in goober, which touches the DOM at import as soon as a `window` global exists.
mock.module('react-hot-toast', () => {
  const toast = Object.assign(() => '', {
    success: () => '',
    error: () => '',
    loading: () => '',
    dismiss: () => {},
    custom: () => '',
  })
  return { default: toast, toast, Toaster: () => null, useToaster: () => ({ toasts: [] }) }
})
mock.module('expo-image', () => ({
  Image: 'ExpoImage',
  ImageBackground: 'ExpoImageBackground',
  useImage: () => null,
}))
mock.module('expo-web-browser', () => ({
  openBrowserAsync: async () => ({ type: 'opened' }),
  openAuthSessionAsync: async () => ({ type: 'success', url: '' }),
  maybeCompleteAuthSession: () => {},
  dismissBrowser: async () => {},
}))

export type NoraViewEvent =
  | { type: 'mount' }
  | { type: 'unmount' }
  // Native loads go through the imperative handle; desktop loads assign to `src`.
  | { type: 'loadUrl'; url: string }
  | { type: 'src'; url: string }

export const noraViewEvents: NoraViewEvent[] = []

export const resetNoraViewEvents = () => {
  noraViewEvents.length = 0
}

export const noraViewLoads = () =>
  noraViewEvents.filter((event) => event.type === 'loadUrl' || event.type === 'src').map((event) => event.url)

export const noraViewMountCount = () => noraViewEvents.filter((event) => event.type === 'mount').length

/**
 * Stands in for both the native view and the Electron <webview>: it records mounts and
 * every load the tab issues, through either the imperative handle or the `src` assignment
 * the desktop ref callback uses.
 */
const NoraViewMock = React.forwardRef<unknown, Record<string, unknown>>((_props, ref) => {
  React.useImperativeHandle(ref, () => {
    const handle = {
      loadUrl: (url: string) => {
        noraViewEvents.push({ type: 'loadUrl', url })
        return Promise.resolve()
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      getTitle: () => '',
      getURL: () => '',
      isLoading: () => false,
      canGoBack: () => false,
      stop: () => {},
      reload: () => {},
      executeJavaScript: async () => undefined,
    }
    let src = ''
    Object.defineProperty(handle, 'src', {
      get: () => src,
      set: (value: string) => {
        src = value
        noraViewEvents.push({ type: 'src', url: value })
      },
    })
    return handle
  }, [])

  React.useEffect(() => {
    noraViewEvents.push({ type: 'mount' })
    return () => {
      noraViewEvents.push({ type: 'unmount' })
    }
  }, [])

  return null
})
NoraViewMock.displayName = 'NoraViewMock'

mock.module('@/modules/nora-view', () => ({ default: NoraViewMock, NoraView: NoraViewMock }))
