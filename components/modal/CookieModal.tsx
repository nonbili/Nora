import { NoraView } from '@/modules/nora-view'
import { mainClient } from '@/desktop/src/renderer/ipc/main'
import { getUserAgent } from '@/lib/useragent'
import { isIos, isWeb } from '@/lib/utils'
import { showToast } from '@/lib/toast'
import { settings$ } from '@/states/settings'
import { tabs$ } from '@/states/tabs'
import { ui$ } from '@/states/ui'
import { useValue } from '@legendapp/state/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getDocumentAsync } from 'expo-document-picker'
import { ScrollView, TextInput, View, useWindowDimensions } from 'react-native'
import { NouButton } from '../button/NouButton'
import { NouText } from '../NouText'
import { BaseCenterModal } from './BaseCenterModal'
import { executeWebviewJavaScript, reloadWebview } from '@/lib/webview'
import { ProfileSelectorChips } from '../profile/ProfileSelectorChips'

type InjectionRequest = {
  id: number
  entries: string[]
  profileId: string
  url: string
  desktopMode?: boolean
}

type TabLike = {
  url?: string
  profile?: string
  desktopMode?: boolean
}

const getCookieEntries = (value: string) =>
  value
    .split('\n')
    .flatMap((line) => {
      const trimmed = line.trim()
      if (!trimmed) {
        return []
      }

      if (trimmed.includes('\t')) {
        const parts = trimmed.split('\t')
        if (parts.length >= 7 && parts[5]) {
          return [`${parts[5]}=${parts[6] || ''}`]
        }
      }

      if (trimmed.startsWith('#')) {
        return []
      }

      return trimmed
        .split(';')
        .map((entry) => entry.trim())
        .filter((entry) => entry.includes('='))
    })

const buildCookieScript = (entries: string[]) => `(() => {
  const entries = ${JSON.stringify(entries)};
  for (const entry of entries) {
    document.cookie = entry + '; path=/; max-age=31536000';
  }
  return document.cookie;
})()`

const loadInjectorUrl = (injector: any, url: string) => {
  if (injector && 'src' in injector) {
    injector.src = url
    return Promise.resolve()
  }
  if (typeof injector?.loadUrl === 'function') {
    return injector.loadUrl(url)
  }
  if (typeof injector?.loadURL === 'function') {
    return injector.loadURL(url)
  }
  return Promise.reject(new TypeError('Injector does not support loading URLs'))
}

const getHost = (url?: string) => {
  if (!url) {
    return ''
  }

  try {
    return new URL(url).host
  } catch {
    return ''
  }
}

const getInjectionContext = (tabs: TabLike[], activeTabIndex: number, profileId: string) => {
  const toContext = (tab?: TabLike | null) => {
    const url = tab?.url?.trim()
    if (!url) {
      return null
    }
    return {
      url,
      desktopMode: tab?.desktopMode,
    }
  }

  const selectedProfileTab = tabs.find((tab) => tab?.profile === profileId && tab?.url?.trim())

  return (
    toContext(selectedProfileTab) ||
    toContext(tabs[activeTabIndex]) ||
    toContext(tabs.find((tab) => tab?.url?.trim())) ||
    null
  )
}

export const CookieModal = () => {
  const cookieModalOpen = useValue(ui$.cookieModalOpen)
  const profiles = useValue(settings$.profiles)
  const tabs = useValue(tabs$.tabs)
  const activeTabIndex = useValue(tabs$.activeTabIndex)
  const lastSelectedProfileId = useValue(ui$.lastSelectedProfileId)
  const { height: viewportHeight } = useWindowDimensions()

  const currentTab = tabs[activeTabIndex]

  const [text, setText] = useState('')
  const [selectedProfileId, setSelectedProfileId] = useState('default')
  const [submitting, setSubmitting] = useState(false)
  const [injectorReady, setInjectorReady] = useState(false)
  const [request, setRequest] = useState<InjectionRequest | null>(null)

  const effectiveProfileId = selectedProfileId || currentTab?.profile || 'default'
  const injectionContext = getInjectionContext(tabs, activeTabIndex, effectiveProfileId)

  const injectorRef = useRef<any>(null)
  const requestRef = useRef<InjectionRequest | null>(null)
  const startedRequestIdRef = useRef<number | null>(null)
  const wasOpenRef = useRef(false)

  const resetState = useCallback(() => {
    setText('')
    setSubmitting(false)
    setInjectorReady(false)
    setRequest(null)
    requestRef.current = null
    startedRequestIdRef.current = null
    injectorRef.current = null
  }, [])

  const onClose = useCallback(() => {
    resetState()
    ui$.cookieModalOpen.set(false)
  }, [resetState])

  useEffect(() => {
    if (!cookieModalOpen) {
      wasOpenRef.current = false
      resetState()
      return
    }

    if (wasOpenRef.current) {
      return
    }

    wasOpenRef.current = true
    setSelectedProfileId(currentTab?.profile || lastSelectedProfileId || profiles[0]?.id || 'default')
    setText('')
    setSubmitting(false)
    setInjectorReady(false)
    setRequest(null)
    requestRef.current = null
    startedRequestIdRef.current = null
  }, [cookieModalOpen, currentTab?.profile, lastSelectedProfileId, profiles, resetState])

  useEffect(() => {
    requestRef.current = request
  }, [request])

  const onInjectorRef = useCallback((ref: any) => {
    injectorRef.current = ref
    setInjectorReady(Boolean(ref))
  }, [])

  useEffect(() => {
    if (!request || !injectorReady || !injectorRef.current) {
      return
    }

    const injector = injectorRef.current
    const timer = setTimeout(() => {
      if (requestRef.current?.id !== request.id || injectorRef.current !== injector) {
        return
      }

      void Promise.resolve(loadInjectorUrl(injector, request.url)).catch(() => {
        if (requestRef.current?.id !== request.id) {
          return
        }
        showToast('Failed to open the target website')
        setSubmitting(false)
        setRequest(null)
        requestRef.current = null
      })
    }, 50)

    return () => clearTimeout(timer)
  }, [injectorReady, request])

  const onInjectorLoad = useCallback(async (e: { nativeEvent?: { url?: string } }) => {
    const activeRequest = requestRef.current
    const injector = injectorRef.current
    const loadedHost = getHost(e.nativeEvent?.url)

    if (!activeRequest || !injector || !loadedHost || startedRequestIdRef.current === activeRequest.id) {
      return
    }

    startedRequestIdRef.current = activeRequest.id

    try {
      await executeWebviewJavaScript(injector, buildCookieScript(activeRequest.entries))

      const activeProfileId = tabs$.currentTab()?.profile || 'default'
      if (activeProfileId === activeRequest.profileId) {
        const webview = ui$.webview.get()
        reloadWebview(webview)
      }

      const profileName =
        settings$.profiles.get().find((profile) => profile.id === activeRequest.profileId)?.name || 'selected profile'
      showToast(`Injected ${activeRequest.entries.length} cookies into ${profileName}`)
      onClose()
    } catch {
      showToast('Failed to inject cookie')
      setSubmitting(false)
      setRequest(null)
      requestRef.current = null
      startedRequestIdRef.current = null
    }
  }, [onClose])

  const onPickFile = useCallback(async () => {
    try {
      if (!isWeb) {
        const result = await getDocumentAsync({
          type: ['text/plain', 'text/tab-separated-values'],
          copyToCacheDirectory: true,
          multiple: false,
        })

        if (result.canceled || !result.assets?.[0]) {
          return
        }

        const response = await fetch(result.assets[0].uri)
        setText(await response.text())
        return
      }

      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.txt,text/plain,text/tab-separated-values'

      input.onchange = async () => {
        const file = input.files?.[0]
        if (!file) {
          return
        }
        setText(await file.text())
      }

      input.click()
    } catch {
      showToast('Failed to import cookies.txt')
    }
  }, [])

  const onSubmit = useCallback(() => {
    const entries = getCookieEntries(text.trim())
    if (!entries.length) {
      showToast('Invalid cookie or cookies.txt content')
      return
    }

    if (!injectionContext?.url) {
      showToast('Open any page before injecting cookies')
      return
    }

    ui$.lastSelectedProfileId.set(effectiveProfileId)

    if (isWeb) {
      setSubmitting(true)
      void mainClient
        .setCookie(effectiveProfileId, injectionContext.url, entries.join('; '))
        .then(() => {
          const activeProfileId = tabs$.currentTab()?.profile || 'default'
          if (activeProfileId === effectiveProfileId) {
            const webview = ui$.webview.get()
            reloadWebview(webview)
          }

          const profileName =
            settings$.profiles.get().find((profile) => profile.id === effectiveProfileId)?.name || 'selected profile'
          showToast(`Injected ${entries.length} cookies into ${profileName}`)
          onClose()
        })
        .catch(() => {
          showToast('Failed to inject cookie')
          setSubmitting(false)
        })
      return
    }

    setSubmitting(true)
    setInjectorReady(false)
    setRequest({
      id: Date.now(),
      entries,
      profileId: effectiveProfileId,
      url: injectionContext.url,
      desktopMode: injectionContext.desktopMode,
    })
  }, [effectiveProfileId, injectionContext, onClose, text])

  if (!cookieModalOpen) {
    return null
  }

  const modalMaxHeight = Math.min(Math.max(360, viewportHeight * 0.72), 720)

  return (
    <BaseCenterModal onClose={onClose}>
      <ScrollView
        className="w-full"
        style={{ maxHeight: modalMaxHeight }}
        contentContainerStyle={{ padding: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <NouText className="text-lg font-semibold">Inject cookies into the webview</NouText>
        <NouText className="mt-2 text-sm leading-6 text-gray-400">
          Paste a Cookie header from your desktop browser, or import a `cookies.txt` export. This is a workaround when
          sign-in inside the webview does not work.
        </NouText>

        <View className="mt-5">
          <NouText className="mb-3 text-sm font-medium text-gray-200">Target profile</NouText>
          <ProfileSelectorChips
            profiles={profiles}
            selectedProfileId={selectedProfileId}
            onSelectProfile={setSelectedProfileId}
            disabled={submitting}
          />
        </View>

        <View className="mt-5">
          <NouText className="mb-3 text-sm font-medium text-gray-200">Cookie header or cookies.txt export</NouText>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            className="min-h-[144px] rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-4 text-white"
            editable={!submitting}
            multiline
            onChangeText={setText}
            placeholder={'cookie_name=value; other_cookie=value\nor\ncookies.txt export'}
            placeholderTextColor="#71717a"
            style={{ textAlignVertical: 'top' }}
            value={text}
          />
          {!injectionContext?.url ? (
            <NouText className="mt-2 text-xs leading-5 text-amber-300">
              Open any page in the app once before injecting cookies.
            </NouText>
          ) : null}
        </View>

        <View className="mt-6 flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <NouButton variant="outline" size="1" onPress={onClose} disabled={submitting}>
              Close
            </NouButton>
            <NouButton variant="soft" size="1" onPress={onPickFile} disabled={submitting}>
              Import
            </NouButton>
          </View>
          <NouButton size="1" onPress={onSubmit} disabled={submitting} loading={submitting}>
            Inject
          </NouButton>
        </View>

        {request ? (
          <View pointerEvents="none" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}>
            <NoraView
              key={`${request.id}:${request.profileId}`}
              ref={onInjectorRef}
              profile={request.profileId}
              useragent={getUserAgent(isIos ? 'ios' : 'android', request.desktopMode)}
              onLoad={onInjectorLoad}
            />
          </View>
        ) : null}
      </ScrollView>
    </BaseCenterModal>
  )
}
