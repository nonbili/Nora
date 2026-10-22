import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import reactNativeWeb from 'vite-plugin-react-native-web'

// What esbuild would read of the app's tsconfig, given here: the tsconfig extends
// `expo/tsconfig.base`, which Expo no longer exports for Vite to resolve. Given as text, so
// Vite does not read the tsconfig at all.
const esbuild = { tsconfigRaw: JSON.stringify({ compilerOptions: { jsx: 'react-jsx', useDefineForClassFields: true } }) }

export default defineConfig({
  main: {
    esbuild,
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@': 'nora',
        main: resolve('src/main'),
      },
    },
  },
  preload: {
    esbuild,
    plugins: [externalizeDepsPlugin({ exclude: ['nora'] })],
  },
  renderer: {
    esbuild,
    optimizeDeps: {
      esbuildOptions: {
        tsconfigRaw: esbuild.tsconfigRaw,
        plugins: [{
          name: 'desktop-svg-sound',
          setup(build) {
            // esbuild resolves this require separately from Vite's import aliases.
            build.onResolve({ filter: /\/fabric\/NativeSvgSoundModule(?:\.js)?$/ }, () => ({
              path: resolve('src/renderer/lib/svg-sound-module.ts'),
            }))
          },
        }],
      },
    },
    resolve: {
      alias: {
        'node:async_hooks': resolve('src/renderer/lib/async-hooks.ts'),
        // SVG's web implementation must share the registry used by React Native Web.
        '@react-native/assets-registry/registry': resolve('../node_modules/react-native-web/dist/modules/AssetRegistry/index.js'),
        '../fabric/NativeSvgSoundModule': resolve('src/renderer/lib/svg-sound-module.ts'),
        '@': 'nora',
        '@renderer': resolve('src/renderer'),
        main: resolve('src/main'),
        'expo-modules-core-polyfill': resolve('../node_modules/expo-modules-core/src/polyfill/index.web.ts'),
      },
    },
    plugins: [
      react({
        // https://stackoverflow.com/a/79079523
        babel: {
          plugins: [
            [
              '@babel/plugin-transform-react-jsx',
              {
                runtime: 'automatic',
                importSource: 'nativewind',
              },
            ],
            // https://docs.swmansion.com/react-native-reanimated/docs/fundamentals/getting-started/#web
            '@babel/plugin-proposal-export-namespace-from',
            'react-native-worklets/plugin',
          ],
        },
      }),
      reactNativeWeb(),
      {
        name: 'desktop-react-native',
        // Apply after reactNativeWeb's config hook, which adds its own alias.
        config: () => ({
          resolve: {
            alias: [
              { find: /^react-native$/, replacement: resolve('src/renderer/lib/react-native.js') },
              // Erase declaration-only imports without changing other Expo packages' entry points.
              { find: /^expo-modules-core$/, replacement: resolve('../node_modules/expo-modules-core/src/index.ts') },
            ],
          },
        }),
      },
    ],
  },
})
