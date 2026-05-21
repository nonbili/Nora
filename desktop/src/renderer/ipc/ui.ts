import { showToast } from '@/lib/toast.js'
import { ui$ } from '@/states/ui.js'
import { tabs$ } from '@/states/tabs.js'
import { tabGroups$ } from '@/states/tab-groups.js'
import { handleDeeplink } from '../lib/deeplink.js'
import { UI_CHANNEL } from 'main/ipc/constants.js'

function openLinkInProfile(url: string) {
  ui$.profileLinkUrl.set(url)
}

function openTab(url: string) {
  const parentTabId = tabs$.currentTab()?.id
  tabGroups$.setActiveGroup(null)
  tabs$.openTab(url, { parentTabId, source: 'child' })
}

const interfaces = {
  handleDeeplink,
  openLinkInProfile,
  openTab,
  showToast,
}

export type UiInterface = typeof interfaces
type UiInterfaceKey = keyof UiInterface

function setupChannel() {
  window.electron.ipcRenderer.on(UI_CHANNEL, (e, v) => {
    const { name, args } = v
    console.log(UI_CHANNEL, name, JSON.stringify(args).slice(0, 100))
    const fn = interfaces[name as UiInterfaceKey]
    if (!fn) {
      console.error(`${fn} unimplemented`)
      return
    }
    // @ts-expect-error ??
    return fn(...args)
  })
}

export function initUiChannel() {
  setupChannel()
}
