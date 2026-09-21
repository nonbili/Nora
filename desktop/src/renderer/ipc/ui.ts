import { showToast } from '@/lib/toast.js'
import { ui$ } from '@/states/ui.js'
import { tabs$ } from '@/states/tabs.js'
import { tabGroups$ } from '@/states/tab-groups.js'
import { handleDeeplink } from '../lib/deeplink.js'
import { getTabIdByWebContentsId } from '@/lib/webview'
import { showImagePreview, updateImagePreview } from '../lib/image-preview'
import { UI_CHANNEL } from 'main/ipc/constants.js'

function openLinkInProfile(url: string) {
  ui$.profileLinkUrl.set(url)
}

function openTab(url: string, sourceWebContentsId?: number) {
  const parentTabId = sourceWebContentsId === undefined
    ? tabs$.currentTab()?.id
    : getTabIdByWebContentsId(sourceWebContentsId) ?? tabs$.currentTab()?.id
  const parentTab = tabs$.tabs.get().find((tab) => tab.id === parentTabId)
  tabGroups$.setActiveGroup(null)
  tabs$.openTab(url, { parentTabId, profile: parentTab ? parentTab.profile || 'default' : undefined, source: 'child' })
}

const interfaces = {
  showImagePreview,
  updateImagePreview,
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
    console.log(UI_CHANNEL, name, args.map((arg: unknown) => typeof arg))
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
