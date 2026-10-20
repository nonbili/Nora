import {
  Button,
  Host,
  NavigationDestination,
  NavigationStack,
  RNHostView,
  Toolbar,
  ToolbarItem,
} from '@expo/ui/swift-ui'
import { navigationBarTitleDisplayMode, navigationTitle } from '@expo/ui/swift-ui/modifiers'
import { ScrollView, View } from 'react-native'
import { t } from 'i18next'
import type { SettingsNavigationProps, SettingsPage } from './SettingsNavigation'

export const SettingsNavigation = ({
  pageStack,
  titles,
  onPathChange,
  onClose,
  renderPage,
}: SettingsNavigationProps) => {
  const screen = (page: SettingsPage) => (
    <Toolbar modifiers={[navigationTitle(titles[page]), navigationBarTitleDisplayMode('inline')]}>
      <RNHostView>
        <ScrollView
          className="flex-1 bg-zinc-100 dark:bg-zinc-950"
          contentContainerClassName="px-4 py-5"
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          {renderPage(page)}
          <View className="h-8" />
        </ScrollView>
      </RNHostView>
      <Toolbar.Content>
        <ToolbarItem placement="topBarTrailing">
          <Button label={t('menus.close')} onPress={onClose} />
        </ToolbarItem>
      </Toolbar.Content>
    </Toolbar>
  )

  return (
    <Host style={{ flex: 1 }}>
      <NavigationStack
        path={pageStack.slice(1)}
        onPathChange={(path) =>
          onPathChange(path.filter((page): page is SettingsPage => page !== 'home' && page in titles))
        }
      >
        {screen('home')}
        {[...new Set(pageStack.slice(1))].map((page) => (
          <NavigationDestination key={page} value={page}>
            {screen(page)}
          </NavigationDestination>
        ))}
      </NavigationStack>
    </Host>
  )
}
