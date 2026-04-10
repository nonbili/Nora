import { resolve } from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import reactNativeWeb from 'vite-plugin-react-native-web'

export default defineConfig({
  base: './',
  root: 'src/renderer',
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
      'expo-modules-core-polyfill': resolve(__dirname, '../node_modules/expo-modules-core/src/polyfill/index.web.ts'),
      '@/desktop/src/renderer/ipc/main': resolve(__dirname, 'src/renderer/ipc/main'),
      '@': resolve(__dirname, '..')
    }
  },
  plugins: [
    react({
      babel: {
        plugins: [
          [
            '@babel/plugin-transform-react-jsx',
            {
              runtime: 'automatic',
              importSource: 'nativewind',
            },
          ],
          '@babel/plugin-proposal-export-namespace-from',
          'react-native-worklets/plugin',
        ],
      },
    }),
    reactNativeWeb(),
  ],
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'src/renderer/index.html')
      }
    }
  },
  server: {
    port: 5173
  }
})
