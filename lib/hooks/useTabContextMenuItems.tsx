import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useColorScheme } from 'react-native'
import { t } from 'i18next'
import { colors } from '@/lib/colors'
import { type ContextItem } from '@/components/menu/NouContextMenu'
import { type Tab, tabs$ } from '@/states/tabs'
import { createDesktopTabGroupFromTab, tabGroups$ } from '@/states/tab-groups'
import { ui$ } from '@/states/ui'
import { addBookmark } from '@/lib/bookmark'
import { share } from '@/lib/share'
import { getTabWebview, pauseWebview, executeWebviewJavaScriptQuietly } from '@/lib/webview'
import { isWeb } from '@/lib/utils'
import { clearHostData } from '@/lib/profile-data'
import { confirmDestructiveAction } from '@/lib/confirm'
import { showToast } from '@/lib/toast'

export interface TabContextMenuOptions {
  runWebviewAction: (action: (webview: any) => void) => void
  canDuplicate?: boolean
}

export const useTabContextMenuItems = (tab: Tab, options: TabContextMenuOptions) => {
  const colorScheme = useColorScheme()
  const menuIconColor = colorScheme === 'light' ? colors.iconLightStrong : colors.icon

  let host = ''
  if (tab.url) {
    try {
      host = new URL(tab.url).hostname
    } catch {}
  }

  const clearSiteData = () => {
    if (!host) {
      return
    }
    confirmDestructiveAction(
      t('menus.clearSiteData'),
      t('menus.clearSiteDataConfirm', { host }),
      t('menus.clearSiteData'),
      () => {
        void clearHostData(host, tab.profile || 'default')
          .then(() => {
            showToast(t('toast.siteDataCleared'))
            options.runWebviewAction((webview) => {
              if (typeof webview.reload === 'function') {
                webview.reload()
              } else {
                void executeWebviewJavaScriptQuietly(webview, 'document.location.reload()')
              }
            })
          })
          .catch(() => showToast(t('toast.siteDataClearFailed')))
      },
    )
  }

  const togglePause = () => {
    const index = tabs$.tabs.get().findIndex((currentTab) => currentTab.id === tab.id)
    const nextPaused = !tab.isPaused
    if (index !== -1) {
      tabs$.setTabPaused(nextPaused, index)
    }

    // On desktop, flipping isPaused unmounts the webview (a real discard that frees
    // CPU/memory and is reloaded on resume). On native we can't discard cleanly, so
    // fall back to stopping the load and pausing any playing media.
    if (nextPaused && !isWeb) {
      const tabWebview = getTabWebview(tab.id)
      if (tabWebview) {
        pauseWebview(tabWebview)
      } else {
        options.runWebviewAction(pauseWebview)
      }
    }
  }

  const items: ContextItem[] = [
    {
      label: t('menus.reload'),
      icon: <MaterialIcons name="refresh" size={16} color={menuIconColor} />,
      handler: () =>
        options.runWebviewAction((webview) => {
          if (typeof webview.reload === 'function') {
            webview.reload()
          } else {
            void executeWebviewJavaScriptQuietly(webview, 'document.location.reload()')
          }
        }),
    },
    {
      label: tab.isPaused ? t('menus.resume') : t('menus.pause'),
      icon: (
        <MaterialIcons name={tab.isPaused ? 'play-arrow' : 'pause'} size={16} color={menuIconColor} />
      ),
      handler: togglePause,
    },
    {
      label: t('menus.editUrl'),
      icon: <MaterialIcons name="edit" size={16} color={menuIconColor} />,
      handler: () => {
        ui$.assign({ urlModalOpen: true, urlModalMode: 'editTab', urlModalTargetTabId: tab.id })
      },
    },
    {
      label: t('menus.scroll'),
      icon: <MaterialIcons name="vertical-align-top" size={16} color={menuIconColor} />,
      handler: () =>
        options.runWebviewAction((webview) => {
          void executeWebviewJavaScriptQuietly(webview, `window.scrollTo(0, 0, {behavior: 'smooth'})`)
        }),
    },
    { kind: 'separator' },
    {
      label: t('views.desktop.newGroupFromTab'),
      icon: <MaterialIcons name="create-new-folder" size={16} color={menuIconColor} />,
      handler: () => {
        const groupId = createDesktopTabGroupFromTab(tab.id)
        if (groupId) {
          tabGroups$.setActiveGroup(groupId)
        }
        tabs$.setActiveTabById(tab.id, 'system')
      },
    },
    {
      label: t('menus.openInProfile'),
      icon: <MaterialIcons name="account-circle" size={16} color={menuIconColor} />,
      handler: () => {
        if (tab.url) {
          ui$.profileLinkUrl.set(tab.url)
        }
      },
    },
    ...(options.canDuplicate !== false
      ? [
          {
            label: t('menus.duplicate'),
            icon: <MaterialIcons name="content-copy" size={16} color={menuIconColor} />,
            handler: () => tabs$.duplicateTab(tab.id),
          },
        ]
      : []),
    { kind: 'separator' },
    {
      label: t('menus.addBookmark'),
      icon: <MaterialIcons name="bookmark-add" size={16} color={menuIconColor} />,
      handler: () => addBookmark(tab),
    },
    {
      label: t('menus.share'),
      icon: <MaterialIcons name="share" size={16} color={menuIconColor} />,
      handler: () => share(tab.url || ''),
    },
    ...(host
      ? [
          {
            label: t('menus.clearSiteData'),
            icon: <MaterialIcons name="delete-sweep" size={16} color={menuIconColor} />,
            handler: clearSiteData,
          },
        ]
      : []),
    { kind: 'separator' },
    {
      label: t('menus.close'),
      icon: <MaterialIcons name="close" size={16} color="#f87171" />,
      color: 'red',
      handler: () => {
        const index = tabs$.tabs.get().findIndex((t) => t.id === tab.id)
        if (index !== -1) {
          tabs$.closeTab(index)
        }
      },
    },
    {
      label: t('buttons.closeAll'),
      icon: <MaterialIcons name="tab-unselected" size={16} color={menuIconColor} />,
      handler: () => tabs$.closeAll(),
    },
  ]

  return items
}
