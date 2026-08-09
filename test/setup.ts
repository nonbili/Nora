import { mock } from 'bun:test'

// Font assets reach the graph through icon packages; bun has no loader for them.
Bun.plugin({
  name: 'asset-stub',
  setup(build) {
    build.onLoad({ filter: /\.(ttf|otf|png|jpg|jpeg|gif|svg|webp)$/ }, () => ({
      contents: 'export default 1',
      loader: 'js',
    }))
  },
})

// React Native's dev-only branches read this global; the bundler normally injects it.
;(globalThis as { __DEV__?: boolean }).__DEV__ = false
// Lets React's act() flush effects and state updates instead of warning.
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// expo-modules-core reads its native runtime off this global at import time.
class ExpoEventEmitterStub {
  addListener() {
    return { remove: () => {} }
  }
  removeAllListeners() {}
  removeListener() {}
  emit() {}
}
;(globalThis as { expo?: unknown }).expo = {
  EventEmitter: ExpoEventEmitterStub,
  NativeModule: class extends ExpoEventEmitterStub {},
  SharedObject: class extends ExpoEventEmitterStub {},
  SharedRef: class extends ExpoEventEmitterStub {},
  // Any expo module resolves to an inert stub, so requireNativeModule() succeeds for
  // whichever ones the component graph happens to pull in.
  modules: new Proxy({} as Record<string, unknown>, {
    get: (target, name: string) => {
      if (!target[name]) {
        target[name] = new Proxy(new ExpoEventEmitterStub() as unknown as Record<string, unknown>, {
          // A plain function, not an arrow: some modules are consumed as base classes.
          get: (moduleTarget: Record<string, unknown>, key: string) =>
            key in moduleTarget ? moduleTarget[key] : function stub() {},
        })
      }
      return target[name]
    },
    has: () => true,
  }),
  uuidv4: () => '00000000-0000-4000-8000-000000000000',
  uuidv5: () => '00000000-0000-5000-8000-000000000000',
  getViewConfig: () => null,
  reloadAppAsync: async () => {},
}

// Native modules can't be loaded by bun (react-native's entrypoint uses Flow
// syntax), so state modules that persist via MMKV need these stubs.

mock.module('react-native-get-random-values', () => ({}))

// Components render through react-test-renderer, where a host component is just a string
// tag, so the primitives only need names the tree can be queried by.
const host = (name: string) => name as unknown as React.ComponentType<Record<string, unknown>>

mock.module('react-native', () => ({
  Platform: {
    OS: 'android',
    select: (obj: Record<string, unknown>) => obj?.android ?? obj?.native ?? obj?.default,
  },
  Alert: { alert: () => {} },
  View: host('View'),
  Text: host('Text'),
  Pressable: host('Pressable'),
  ScrollView: host('ScrollView'),
  ActivityIndicator: host('ActivityIndicator'),
  StyleSheet: {
    create: <T,>(styles: T) => styles,
    flatten: (style: unknown) => style,
    absoluteFill: {},
    absoluteFillObject: {},
    hairlineWidth: 1,
  },
  Appearance: {
    getColorScheme: () => 'dark',
    addChangeListener: () => ({ remove: () => {} }),
  },
  useColorScheme: () => 'dark',
  Dimensions: {
    get: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
    addEventListener: () => ({ remove: () => {} }),
  },
  NativeModules: {},
  processColor: (color: unknown) => color,
  AppRegistry: { registerComponent: () => {}, runApplication: () => {} },
  LogBox: { ignoreLogs: () => {}, ignoreAllLogs: () => {} },
  Share: { share: async () => ({ action: 'sharedAction' }) },
  Clipboard: { setString: () => {}, getString: async () => '' },
  Vibration: { vibrate: () => {} },
  ToastAndroid: { show: () => {}, SHORT: 0, LONG: 1 },
  Image: host('Image'),
  TextInput: host('TextInput'),
  TouchableOpacity: host('TouchableOpacity'),
  TouchableHighlight: host('TouchableHighlight'),
  TouchableWithoutFeedback: host('TouchableWithoutFeedback'),
  Modal: host('Modal'),
  StatusBar: host('StatusBar'),
  SafeAreaView: host('SafeAreaView'),
  FlatList: host('FlatList'),
  RefreshControl: host('RefreshControl'),
  Switch: host('Switch'),
  KeyboardAvoidingView: host('KeyboardAvoidingView'),
  Animated: {
    View: host('Animated.View'),
    Text: host('Animated.Text'),
    createAnimatedComponent: (component: unknown) => component,
    Value: class {
      setValue() {}
      interpolate() {
        return this
      }
      addListener() {
        return ''
      }
      removeAllListeners() {}
    },
    timing: () => ({ start: (cb?: () => void) => cb?.(), stop: () => {} }),
    spring: () => ({ start: (cb?: () => void) => cb?.(), stop: () => {} }),
    event: () => () => {},
  },
  Easing: { linear: (t: number) => t, inOut: (fn: unknown) => fn, ease: (t: number) => t },
  LayoutAnimation: { configureNext: () => {}, Presets: {} },
  PanResponder: { create: () => ({ panHandlers: {} }) },
  DeviceEventEmitter: { addListener: () => ({ remove: () => {} }), emit: () => {} },
  useWindowDimensions: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
  unstable_batchedUpdates: (cb: () => void) => cb(),
  TurboModuleRegistry: { get: () => null, getEnforcing: () => ({}) },
  NativeEventEmitter: class {
    addListener() {
      return { remove: () => {} }
    }
    removeAllListeners() {}
  },
  requireNativeComponent: (name: string) => host(name),
  findNodeHandle: () => null,
  UIManager: { getViewManagerConfig: () => null },
  I18nManager: { isRTL: false, getConstants: () => ({ isRTL: false, doLeftAndRightSwapInRTL: true }) },
  InteractionManager: { runAfterInteractions: (cb: () => void) => (cb(), { cancel: () => {} }) },
  Linking: { openURL: async () => {}, canOpenURL: async () => true, addEventListener: () => ({ remove: () => {} }) },
  Keyboard: { dismiss: () => {}, addListener: () => ({ remove: () => {} }) },
  BackHandler: { addEventListener: () => ({ remove: () => {} }) },
  AppState: { currentState: 'active', addEventListener: () => ({ remove: () => {} }) },
  PixelRatio: { get: () => 3, getFontScale: () => 1, roundToNearestPixel: (n: number) => n },
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
