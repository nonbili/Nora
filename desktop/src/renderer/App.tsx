import contentJs from 'nora/assets/scripts/main.bjs?raw'
import { MainPage } from 'nora/components/page/MainPage'
import { Toaster } from 'react-hot-toast'
import { useObserveEffect } from '@legendapp/state/react'
import { useEffect } from 'react'
import { initUiChannel } from './ipc/ui'
import { mainClient } from './ipc/main'
import { handleShortcuts } from './lib/shortcuts'
import { HoverLinkBar } from './components/HoverLinkBar'
import { settings$ } from 'nora/states/settings'
import { bookmarks$ } from 'nora/states/bookmarks'
import { homeUrls } from 'nora/lib/page'

const getHost = (url: string | undefined) => {
  if (!url) return ''
  try {
    return new URL(url).host.toLowerCase()
  } catch {
    return ''
  }
}

const getInternalHosts = () => {
  const hosts = new Set<string>()

  Object.values(homeUrls).forEach((url) => {
    const host = getHost(url)
    if (host) hosts.add(host)
  })

  bookmarks$.bookmarks.get().forEach((bookmark) => {
    const host = getHost(bookmark?.url)
    if (host) hosts.add(host)
  })

  return Array.from(hosts)
}

let lastLinkHandlingSettingsKey = ''

function App(): React.JSX.Element {
  useEffect(() => {
    initUiChannel()
    window.addEventListener('keydown', handleShortcuts)
    return () => window.removeEventListener('keydown', handleShortcuts)
  }, [])

  useObserveEffect(() => {
    const openExternalLinkInSystemBrowser = settings$.openExternalLinkInSystemBrowser.get()
    const internalHosts = getInternalHosts()
    const key = JSON.stringify({ openExternalLinkInSystemBrowser, internalHosts })
    if (key === lastLinkHandlingSettingsKey) {
      return
    }
    lastLinkHandlingSettingsKey = key
    void mainClient.setLinkHandlingSettings({
      openExternalLinkInSystemBrowser,
      internalHosts,
    })
  })

  return (
    <>
      <MainPage contentJs={contentJs} />
      <HoverLinkBar />
      <Toaster position="bottom-right" />
    </>
  )
}
export default App
