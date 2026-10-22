import type { ViewInstance } from 'react-native'
import { ui$ } from '@/states/ui'
import { useValue } from '@legendapp/state/react'
import { BaseModal } from './BaseModal'
import { FeedTabIndicator, ServiceIcon } from '../service/Services'
import { View, Text, ScrollView, TouchableOpacity, Pressable, Modal, useColorScheme, useWindowDimensions } from 'react-native'
import { androidHitSlop, clsx, isIos, isWeb, iosTouchTarget, nIf } from '@/lib/utils'
import { settings$ } from '@/states/settings'
import { Tab, sortTabsByOrder, tabs$ } from '@/states/tabs'
import { NouMenu } from '../menu/NouMenu'
import { MenuToggleBadge } from '../menu/MenuToggleBadge'
import { NouButton } from '../button/NouButton'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { t } from 'i18next'
import { colors } from '@/lib/colors'
import { getTabColor } from '@/lib/profile'
import { isFeedTabUrl } from '@/lib/feed-tab'
import { useRef, useState } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTwColor } from '@/lib/theme'
import { SortableTabList } from './SortableTabList'
import Animated, { useAnimatedRef } from 'react-native-reanimated'
import { GestureHandlerRootView } from 'react-native-gesture-handler'

const getTabLabel = (tab?: Pick<Tab, 'title' | 'url'> | null) => tab?.title || tab?.url || t('tabs.new')
type Anchor = { x: number; y: number; width: number; height: number }

export const TabModal = () => {
  const tw = useTwColor()
  const tabModalOpen = useValue(ui$.tabModalOpen)
  const oneHandModeSetting = useValue(settings$.oneHandMode)
  const oneHandMode = !isWeb && oneHandModeSetting
  const tabs = useValue(tabs$.tabs)
  const activeTabIndex = useValue(tabs$.activeTabIndex)
  const orders = useValue(tabs$.orders)
  const orderedTabs = sortTabsByOrder(tabs, orders)
  const [dragging, setDragging] = useState(false)
  const scrollViewRef = useAnimatedRef<Animated.ScrollView>()
  const recentlyClosedTabs = useValue(tabs$.recentlyClosedTabs)
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'
  const iconColor = isDark ? tw(colors.icon) : tw(colors.iconLight)
  const [iosMenuOpen, setIosMenuOpen] = useState(false)
  const [iosMenuAnchor, setIosMenuAnchor] = useState<Anchor | null>(null)
  const iosMenuTriggerRef = useRef<ViewInstance>(null)
  const { width: screenWidth, height: screenHeight, fontScale } = useWindowDimensions()
  const rowHeight = Math.max(44, Math.ceil(20 * fontScale + 18))
  const insets = useSafeAreaInsets()

  if (!tabModalOpen) {
    return null
  }

  const closeModal = () => {
    setDragging(false)
    ui$.tabModalOpen.set(false)
  }
  const onPress = (index: number) => {
    tabs$.setActiveTabIndex(index, 'user')
    closeModal()
  }
  const openIosMenu = () => {
    iosMenuTriggerRef.current?.measureInWindow((x, y, width, height) => {
      setIosMenuAnchor({ x, y, width, height })
      setIosMenuOpen(true)
    })
  }

  const menuItems = [
    ...(!isWeb
      ? [{
          label: t('settings.oneHandMode'),
          icon: <MaterialIcons name={oneHandMode ? 'pan-tool' : 'pan-tool-alt'} size={18} color={oneHandMode ? tw('#818cf8') : tw(colors.iconSubtle)} />,
          metaLabel: oneHandMode ? t('common.on') : t('common.off'),
          meta: isIos ? undefined : <MenuToggleBadge on={oneHandMode} />,
          handler: () => settings$.oneHandMode.toggle(),
        }, {
          label: '',
          handler: () => {},
          kind: 'separator' as const,
        }]
      : []),
    {
      label: t('tabs.recentlyClosed'),
      handler: () => {},
      kind: 'label' as const,
    },
    ...(recentlyClosedTabs.length
      ? [
          ...recentlyClosedTabs.map((tab) => ({
            label: getTabLabel(tab),
            description: tab.title && tab.url && tab.title !== tab.url ? tab.url : undefined,
            icon: <ServiceIcon url={tab.url} icon={tab.icon} />,
            trailing: (
              <TouchableOpacity
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('tabs.removeFromHistory')}
                onPress={(e) => {
                  e?.stopPropagation?.()
                  tabs$.removeClosedTab(tab.id)
                }}
              >
                <MaterialIcons name="close" size={16} color={tw(colors.iconSubtle)} />
              </TouchableOpacity>
            ),
            handler: () => {
              tabs$.reopenClosedTab(tab.id)
              closeModal()
            },
          })),
          {
            label: t('tabs.clearRecentlyClosed'),
            icon: <MaterialIcons name="delete-outline" size={18} color={tw(colors.iconSubtle)} />,
            handler: () => tabs$.clearRecentlyClosedTabs(),
          },
        ]
      : [
          {
            label: t('tabs.noRecentlyClosed'),
            handler: () => {},
            disabled: true,
          },
        ]),
  ]

  const controls = (
    <View className={clsx('flex-row items-center justify-between', isIos ? 'px-4 pt-4 pb-3' : 'mb-4 pr-4')}>
      <NouButton
        accessibilityLabel={t('tabs.new')}
        className="bg-indigo-500 dark:bg-indigo-600"
        onPress={() => {
          tabs$.openTab('')
          closeModal()
        }}
      >
        <MaterialIcons name="add" size={20} color={tw('#eef2ff')} />
      </NouButton>
      <View className="flex-row items-center gap-2">
        {isIos ? (
          <NouButton size="1" variant="outline" onPress={closeModal}>{t('menus.close')}</NouButton>
        ) : null}
        {nIf(
          tabs.length,
          <NouButton
            variant="outline"
            className="mr-1"
            size="1"
            onPress={() => {
              tabs$.closeAll()
              closeModal()
            }}
          >
            {t('buttons.closeAll')}
          </NouButton>,
        )}
        {isIos ? (
          <View ref={iosMenuTriggerRef} collapsable={false}>
            <Pressable onPress={openIosMenu} accessibilityRole="button" accessibilityLabel={t('menus.more')} style={{ width: 44, height: 44 }} className="items-center justify-center rounded-full">
              <MaterialIcons name="more-horiz" size={20} color={iconColor} />
            </Pressable>
          </View>
        ) : (
          <NouMenu
            triggerLabel={t('menus.more')}
            trigger={
              <View className="h-10 w-10 items-center justify-center rounded-full">
                <MaterialIcons name="more-vert" size={20} color={iconColor} />
              </View>
            }
            items={menuItems}
          />
        )}
      </View>
    </View>
  )

  return (
    <BaseModal onClose={closeModal} sheetOnPhone>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {isIos ? controls : null}
        <Animated.ScrollView
          ref={scrollViewRef}
          className={clsx('pl-4', isIos ? 'flex-1' : 'my-4 min-h-full')}
          scrollEnabled={!dragging}
          contentContainerClassName={clsx('min-h-full pb-20', oneHandMode && 'justify-end pt-[35vh]')}
        >
          {!isIos ? controls : null}
          <SortableTabList
            items={orderedTabs}
            rowHeight={rowHeight}
            scrollViewRef={scrollViewRef}
            onDragging={setDragging}
            onReorder={(ids) => tabs$.reorderTabs(ids)}
            renderItem={(tab) => {
              const index = tabs.findIndex((item) => item.id === tab.id)
              return (
                <View className="h-full flex-row items-center justify-between gap-2 pr-4">
                  <TouchableOpacity
                    className="h-full flex-1 min-w-0"
                    onPress={() => onPress(index)}
                    accessibilityHint={t('tabs.reorder')}
                    delayLongPress={250}
                    onLongPress={() => {}}
                  >
                    <View
                      className={clsx(
                        'h-full flex-row items-center gap-3 rounded-md border py-2 px-2',
                        index === activeTabIndex
                          ? 'bg-indigo-200 border-indigo-300 dark:bg-indigo-500/30 dark:border-indigo-400/40'
                          : 'bg-white border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800',
                      )}
                      style={{
                        ...(isFeedTabUrl(tab.url)
                          ? { borderLeftWidth: 1, paddingLeft: 12 }
                          : { borderLeftWidth: 5, borderLeftColor: getTabColor(tab) }),
                        ...iosTouchTarget,
                      }}
                    >
                      <ServiceIcon url={tab.url} icon={tab.icon} />
                      <View className="min-w-0 flex-1">
                        <Text className="text-sm text-zinc-900 dark:text-zinc-100" numberOfLines={1} ellipsizeMode="tail">
                          {getTabLabel(tab)}
                        </Text>
                      </View>
                      <FeedTabIndicator url={tab.url} />
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity
                    className="items-center justify-center p-2 rounded-full"
                    accessibilityRole="button"
                    accessibilityLabel={t('menus.close')}
                    style={iosTouchTarget}
                    hitSlop={androidHitSlop}
                    delayLongPress={250}
                    onLongPress={() => {}}
                    onPress={() => tabs$.closeTab(index)}
                  >
                    <MaterialIcons name="close" size={20} color={iconColor} />
                  </TouchableOpacity>
                </View>
              )
            }}
          />
        </Animated.ScrollView>
      </GestureHandlerRootView>
      {isIos && iosMenuOpen && iosMenuAnchor ? (
        <Modal transparent visible onRequestClose={() => setIosMenuOpen(false)}>
          <View className="flex-1" pointerEvents="box-none">
            <Pressable className="absolute inset-0" onPress={() => setIosMenuOpen(false)} />
            <View
              className="absolute overflow-hidden rounded-2xl border border-zinc-300 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900"
              style={{
                top: Math.min(
                  iosMenuAnchor.y + iosMenuAnchor.height + 6,
                  screenHeight - insets.bottom - Math.min(48 + Math.max(recentlyClosedTabs.length, 1) * 56 + 24, 360) - 8,
                ),
                left: Math.min(
                  Math.max(iosMenuAnchor.x + iosMenuAnchor.width - 280, 8),
                  Math.max(8, screenWidth - 280 - 8),
                ),
                width: 280,
                maxHeight: 360,
              }}
            >
              <ScrollView showsVerticalScrollIndicator={false}>
                {nIf(
                  !isWeb,
                  <Pressable
                    className="flex-row items-center gap-3 px-4 py-3 active:bg-zinc-200 dark:active:bg-zinc-800"
                    onPress={() => {
                      settings$.oneHandMode.toggle()
                      setIosMenuOpen(false)
                    }}
                  >
                    <MaterialIcons
                      name={oneHandMode ? 'pan-tool' : 'pan-tool-alt'}
                      size={18}
                      color={oneHandMode ? tw('#818cf8') : tw('#a1a1aa')}
                    />
                    <Text className="flex-1 text-sm text-zinc-900 dark:text-white">{t('settings.oneHandMode')}</Text>
                    <Text className="text-xs text-zinc-600 dark:text-zinc-400">{oneHandMode ? t('common.on') : t('common.off')}</Text>
                  </Pressable>,
                )}
                {nIf(!isWeb, <View className="mx-3 my-1 h-px bg-zinc-300 dark:bg-zinc-800" />)}
                <View className="flex-row items-center justify-between px-4 pt-2 pb-1">
                  <Text className="text-[11px] uppercase tracking-[1px] text-zinc-600 dark:text-zinc-500">{t('tabs.recentlyClosed')}</Text>
                  {recentlyClosedTabs.length ? (
                    <TouchableOpacity
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel={t('tabs.clearRecentlyClosed')}
                      onPress={() => tabs$.clearRecentlyClosedTabs()}
                    >
                      <Text className="text-[11px] text-indigo-500 dark:text-indigo-400">{t('tabs.clearRecentlyClosed')}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                {recentlyClosedTabs.length ? (
                  recentlyClosedTabs.map((tab) => (
                    <View
                      key={tab.id}
                      className="flex-row items-center active:bg-zinc-200 dark:active:bg-zinc-800"
                    >
                      <Pressable
                        className="flex-1 min-w-0 flex-row items-center gap-3 pl-4 py-3"
                        onPress={() => {
                          tabs$.reopenClosedTab(tab.id)
                          setIosMenuOpen(false)
                          closeModal()
                        }}
                      >
                        <ServiceIcon url={tab.url} icon={tab.icon} />
                        <View className="flex-1 min-w-0">
                          <Text className="text-sm text-zinc-900 dark:text-white" numberOfLines={1}>
                            {getTabLabel(tab)}
                          </Text>
                        </View>
                      </Pressable>
                      <TouchableOpacity
                        className="px-4 py-3"
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={t('tabs.removeFromHistory')}
                        onPress={() => tabs$.removeClosedTab(tab.id)}
                      >
                        <MaterialIcons name="close" size={16} color={tw(colors.iconSubtle)} />
                      </TouchableOpacity>
                    </View>
                  ))
                ) : (
                  <View className="px-4 py-4">
                    <Text className="text-sm text-zinc-600 dark:text-zinc-500">{t('tabs.noRecentlyClosed')}</Text>
                  </View>
                )}
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </BaseModal>
  )
}
