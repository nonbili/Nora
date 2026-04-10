import 'expo-modules-core-polyfill'
import '@/lib/i18n'
import './global.css'

import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { Theme } from '@radix-ui/themes'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { useValue } from '@legendapp/state/react'
import { settings$ } from '@/states/settings'
import { mainClient } from './ipc/main'

const detectDesktopPlatform = (): 'darwin' | 'win32' | 'linux' => {
  const userAgent = navigator.userAgent.toLowerCase()
  const platform = navigator.platform.toLowerCase()

  if (platform.includes('mac') || userAgent.includes('mac os')) {
    return 'darwin'
  }

  if (platform.includes('win') || userAgent.includes('windows')) {
    return 'win32'
  }

  return 'linux'
}

if (typeof window !== 'undefined' && !window.electron) {
  const listeners = new Map<string, Set<(...args: any[]) => void>>()
  const on = (channel: string, listener: (...args: any[]) => void) => {
    let channelListeners = listeners.get(channel)
    if (!channelListeners) {
      channelListeners = new Set()
      listeners.set(channel, channelListeners)
    }
    channelListeners.add(listener)
    return () => {
      channelListeners?.delete(listener)
    }
  }

  ;(window as any).electron = {
    process: {
      platform: detectDesktopPlatform(),
    },
    ipcRenderer: {
      invoke: (channel: string, name: string, ...args: any[]) => {
        if (channel === 'channel:main') {
          return (mainClient as any)[name](...args)
        }
        return Promise.reject(new Error(`Unknown channel: ${channel}`))
      },
      send: () => {},
      sendToHost: () => {},
      on: (channel: string, listener: (...args: any[]) => void) => {
        on(channel, listener)
      },
      once: (channel: string, listener: (...args: any[]) => void) => {
        const off = on(channel, (...args: any[]) => {
          off()
          listener(...args)
        })
      },
      removeListener: (channel: string, listener: (...args: any[]) => void) => {
        listeners.get(channel)?.delete(listener)
      },
      removeAllListeners: (channel: string) => {
        listeners.delete(channel)
      },
    },
  }
}

export function Root(): JSX.Element {
  const theme = useValue(settings$.theme)
  const [systemAppearance, setSystemAppearance] = useState<'dark' | 'light'>(() =>
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => {
      setSystemAppearance(mediaQuery.matches ? 'dark' : 'light')
    }
    onChange()
    mediaQuery.addEventListener?.('change', onChange)
    mediaQuery.addListener?.(onChange)
    return () => {
      mediaQuery.removeEventListener?.('change', onChange)
      mediaQuery.removeListener?.(onChange)
    }
  }, [])

  return (
    <SafeAreaProvider>
      <Theme className="h-screen" appearance={theme ?? systemAppearance} accentColor="gray" grayColor="slate">
        <App />
      </Theme>
    </SafeAreaProvider>
  )
}

createRoot(document.getElementById('root')!).render(<Root />)
