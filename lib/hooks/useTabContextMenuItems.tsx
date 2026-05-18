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
import { executeWebviewJavaScriptQuietly } from '@/lib/webview'

export interface TabContextMenuOptions {
  runWebviewAction: (action: (webview: any) => void) => void
  canDuplicate?: boolean
}

export const useTabContextMenuItems = (tab: Tab, options: TabContextMenuOptions) => {
  const colorScheme = useColorScheme()
  const menuIconColor = colorScheme === 'light' ? colors.iconLightStrong : colors.icon

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
