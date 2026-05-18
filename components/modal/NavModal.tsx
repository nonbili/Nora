import { ui$ } from '@/states/ui'
import { useValue } from '@legendapp/state/react'
import { BaseModal } from './BaseModal'
import { ServiceIcon, services } from '../service/Services'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TouchableHighlight,
  TextInput,
  Modal,
  useColorScheme,
  useWindowDimensions,
} from 'react-native'
import { clsx, isIos, isWeb, nIf } from '@/lib/utils'
import { getHomeUrl } from '@/lib/page'
import { settings$ } from '@/states/settings'
import { tabs$ } from '@/states/tabs'
import { bookmarks$ } from '@/states/bookmarks'
import { t } from 'i18next'
import { useRef, useState } from 'react'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { NouMenu } from '../menu/NouMenu'
import { getEnabledSearchProviders, getResolvedSearchProvider, resolveSearchUrl, resolveUrlInput } from '@/lib/search'
import { SearchProviderIcon } from '../service/SearchProviderIcon'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ProfileSelectorChips } from '../profile/ProfileSelectorChips'
import { colors } from '@/lib/colors'
import { AUTO_PROFILE_ID, getSiteProfileId, isSiteProfileId } from '@/lib/site-profile'
import { BaseCenterModal } from './BaseCenterModal'
import { presetBookmarkGroups, presetBookmarks } from '@/lib/preset-bookmarks'

const cls =
  'flex-row items-center gap-2 rounded-full w-40 py-2 px-3 overflow-hidden border border-zinc-200 bg-white/90 dark:border-zinc-800 dark:bg-zinc-900/90'
const inputCls = 'flex-1 pl-3 pr-1 py-3 text-zinc-900 dark:text-white'
type Anchor = { x: number; y: number; width: number; height: number }

interface NavModalContentProps {
  index?: number
  onOpenUrl?: (url: string, profileId: string) => void
  onSelectProfile?: (profileId: string) => void
  profileId?: string
}

export const NavModalContent: React.FC<NavModalContentProps> = ({
  index = 0,
  onOpenUrl,
  onSelectProfile,
  profileId,
}) => {
  const disabledServices = useValue(settings$.disabledServicesArr)
  const profiles = useValue(settings$.profiles)
  const bookmarks = useValue(bookmarks$.bookmarks)
  const oneHandModeSetting = useValue(settings$.oneHandMode)
  const oneHandMode = !isWeb && oneHandModeSetting
  const enabledSearchProviderIds = useValue(settings$.enabledSearchProviderIds)
  const customSearchProviders = useValue(settings$.customSearchProviders)
  const selectedSearchProviderId = useValue(settings$.selectedSearchProviderId)
  const currentTab = useValue(tabs$.tabs[index])
  const [input, setInput] = useState('')
  const [providerPickerOpen, setProviderPickerOpen] = useState(false)
  const [presetPickerOpen, setPresetPickerOpen] = useState(false)
  const [selectedPresetGroupId, setSelectedPresetGroupId] = useState(presetBookmarkGroups[0].id)
  const [providerAnchor, setProviderAnchor] = useState<Anchor | null>(null)
  const providerTriggerRef = useRef<View>(null)
  const { width: screenWidth, height: screenHeight } = useWindowDimensions()
  const colorScheme = useColorScheme()
  const isDark = colorScheme !== 'light'
  const insets = useSafeAreaInsets()
  const oneProfilePerSite = useValue(settings$.oneProfilePerSite)
  const selectedProfile =
    profileId ||
    (oneProfilePerSite &&
      (currentTab?.profileMode === 'auto' ||
        isSiteProfileId(currentTab?.profile) ||
        (!currentTab?.profileMode && (!currentTab?.profile || currentTab.profile === 'default')))
      ? AUTO_PROFILE_ID
      : currentTab?.profile || 'default')
  const enabledSearchProviders = getEnabledSearchProviders(enabledSearchProviderIds, customSearchProviders)
  const selectedSearchProvider =
    getResolvedSearchProvider(selectedSearchProviderId, customSearchProviders) || enabledSearchProviders[0]
  const bookmarkIndexByUrl = new Map(bookmarks.map((bookmark, index) => [bookmark.url, index]))
  const visiblePresetBookmarks = presetBookmarks.filter((bookmark) => bookmark.groupId === selectedPresetGroupId)

  const openProviderPicker = () => {
    providerTriggerRef.current?.measureInWindow((x, y, width, height) => {
      setProviderAnchor({ x, y, width, height })
      setProviderPickerOpen(true)
    })
  }

  const onPress = (url: string) => {
    if (onOpenUrl) {
      onOpenUrl(url, selectedProfile)
    } else {
      tabs$.updateTabUrl(url, index)
    }
    ui$.assign({ navModalOpen: false })
  }

  const selectProfile = (profileId: string) => {
    if (onSelectProfile) {
      onSelectProfile(profileId)
    } else {
      const tab$ = tabs$.tabs[index]
      if (tab$.get()) {
        if (profileId === AUTO_PROFILE_ID) {
          const currentUrl = tab$.url.peek()
          tab$.profile.set((currentUrl && getSiteProfileId(currentUrl)) || 'default')
          tab$.profileMode.set('auto')
        } else {
          tab$.profile.set(profileId)
          tab$.profileMode.set('manual')
        }
      }
    }
    if (profileId !== AUTO_PROFILE_ID) {
      ui$.lastSelectedProfileId.set(profileId)
    }
  }

  const submitInput = () => {
    const value = input.trim()
    if (!value || !selectedSearchProvider) {
      return
    }

    const nextUrl =
      selectedSearchProvider.kind === 'url'
        ? resolveUrlInput(value)
        : resolveSearchUrl(selectedSearchProvider.id, value, customSearchProviders)

    if (!nextUrl) {
      return
    }

    onPress(nextUrl)
    setInput('')
  }

  const togglePresetBookmark = (preset: (typeof presetBookmarks)[number]) => {
    if (!preset.url) {
      return
    }

    const existingIndex = bookmarkIndexByUrl.get(preset.url)
    if (existingIndex != null) {
      bookmarks$.deleteBookmark(existingIndex)
      return
    }

    bookmarks$.addBookmark({
      url: preset.url,
      title: preset.title,
      icon: preset.icon,
    })
  }

  return (
    <View className="h-full bg-zinc-100 p-4 pt-8 dark:bg-zinc-950 lg:bg-white lg:dark:bg-zinc-900">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-4 px-4 flex-grow justify-center"
        style={{ flexGrow: 0, flexShrink: 0 }}
      >
        <ProfileSelectorChips
          profiles={profiles}
          selectedProfileId={selectedProfile}
          onSelectProfile={selectProfile}
          showAuto={oneProfilePerSite}
          containerClassName="flex-row gap-4"
        />
      </ScrollView>
      <ScrollView
        className="flex-1"
        contentContainerClassName={clsx('pb-16 flex-grow', oneHandMode ? 'justify-end pt-[40vh]' : 'justify-center')}
      >
        <View className="mb-8 mt-6 w-full max-w-2xl self-center px-4">
          <View className="flex-row items-center overflow-hidden rounded-[24px] border border-zinc-300 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900">
            {isIos ? (
              <View ref={providerTriggerRef} collapsable={false}>
                <Pressable
                  onPress={openProviderPicker}
                  className="h-[52px] w-[48px] items-center justify-center border-r border-zinc-300 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900"
                >
                  {selectedSearchProvider ? <SearchProviderIcon provider={selectedSearchProvider} size={22} /> : null}
                </Pressable>
              </View>
            ) : (
              <NouMenu
                trigger={
                  <View className="h-[52px] w-[48px] items-center justify-center border-r border-zinc-300 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900">
                    {selectedSearchProvider ? <SearchProviderIcon provider={selectedSearchProvider} size={22} /> : null}
                  </View>
                }
                items={enabledSearchProviders.map((provider) => ({
                  label: provider.name,
                  handler: () => settings$.setSelectedSearchProvider(provider.id),
                  icon: <SearchProviderIcon provider={provider} />,
                }))}
              />
            )}
            <TextInput
              className={inputCls}
              value={input}
              onChangeText={setInput}
              onSubmitEditing={submitInput}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={
                selectedSearchProvider?.kind === 'url'
                  ? t('newTab.search.urlPlaceholder')
                  : t('newTab.search.searchPlaceholder')
              }
              placeholderTextColor={isDark ? '#71717a' : '#52525b'}
            />
            <Pressable
              onPress={submitInput}
              className="h-[52px] w-[52px] items-center justify-center border-l border-zinc-300 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900 active:bg-zinc-200 dark:active:bg-zinc-800"
            >
              <MaterialIcons
                name={selectedSearchProvider?.kind === 'url' ? 'arrow-forward' : 'search'}
                color={isDark ? colors.icon : colors.iconLightStrong}
                size={18}
              />
            </Pressable>
          </View>
        </View>
        <View className="mt-6 lg:mt-10 flex-row flex-wrap justify-center gap-x-6 gap-y-7">
          {Object.entries(services).map(([value, [label, icon]]) =>
            nIf(
              !disabledServices.includes(value),
              <TouchableHighlight
                key={value}
                onPress={() => onPress(getHomeUrl(value))}
                underlayColor={isDark ? '#1f2937' : '#e0f2fe'}
              >
                <View className={cls}>
                  {icon()}
                  <Text className="text-sm text-zinc-900 dark:text-zinc-100" numberOfLines={1}>
                    {label}
                  </Text>
                </View>
              </TouchableHighlight>,
            ),
          )}
          {bookmarks.map((bookmark, index) => (
            <TouchableHighlight
              key={index}
              onPress={() => onPress(bookmark.url)}
              underlayColor={isDark ? '#1f2937' : '#e0f2fe'}
            >
              <View className={cls}>
                <ServiceIcon url={bookmark.url} icon={bookmark.icon} />
                <Text className="text-sm text-zinc-900 dark:text-zinc-100" numberOfLines={1}>
                  {bookmark.title}
                </Text>
              </View>
            </TouchableHighlight>
          ))}
        </View>
        <View className="mt-8 items-end px-4">
          <Pressable
            onPress={() => setPresetPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('newTab.presets.open')}
            className="h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-white/90 active:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/90 dark:active:bg-zinc-800"
          >
            <MaterialIcons name="edit" size={18} color={isDark ? colors.icon : colors.iconLightStrong} />
          </Pressable>
        </View>
      </ScrollView>
      {presetPickerOpen ? (
        <BaseCenterModal onClose={() => setPresetPickerOpen(false)} containerClassName="max-h-[80vh]">
          <View className="gap-4 p-5">
            <View className="flex-row items-center justify-between gap-4">
              <Text className="flex-1 text-lg font-semibold text-zinc-900 dark:text-white">
                {t('newTab.presets.title')}
              </Text>
              <Pressable
                onPress={() => setPresetPickerOpen(false)}
                accessibilityRole="button"
                accessibilityLabel={t('buttons.cancel')}
                className="h-9 w-9 items-center justify-center rounded-full bg-zinc-200 active:bg-zinc-300 dark:bg-zinc-800 dark:active:bg-zinc-700"
              >
                <MaterialIcons name="close" size={18} color={isDark ? colors.icon : colors.iconLightStrong} />
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2">
              {presetBookmarkGroups.map((group) => {
                const selected = group.id === selectedPresetGroupId
                return (
                  <Pressable
                    key={group.id}
                    onPress={() => setSelectedPresetGroupId(group.id)}
                    className={clsx(
                      'h-7 items-center justify-center rounded-full border px-3',
                      selected
                        ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-950/40'
                        : 'border-zinc-200 bg-white active:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:active:bg-zinc-800',
                    )}
                  >
                    <Text
                      numberOfLines={1}
                      className={clsx(
                        'text-sm font-medium',
                        selected ? 'text-indigo-700 dark:text-indigo-200' : 'text-zinc-700 dark:text-zinc-300',
                      )}
                    >
                      {group.title}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
            <ScrollView className="mt-6 h-[300px]" contentContainerClassName="gap-3 pb-1">
              {Array.from({ length: Math.ceil(visiblePresetBookmarks.length / 2) }, (_, rowIndex) => (
                <View key={rowIndex} className="flex-row gap-3">
                  {visiblePresetBookmarks.slice(rowIndex * 2, rowIndex * 2 + 2).map((preset) => {
                    const added = bookmarkIndexByUrl.has(preset.url)
                    return (
                      <Pressable
                        key={preset.id}
                        onPress={() => togglePresetBookmark(preset)}
                        className={clsx(
                          'min-w-0 flex-1 flex-row items-center gap-2 overflow-hidden rounded-full border border-zinc-200 bg-white/90 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/90',
                          added
                            ? 'border-indigo-300 bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/40'
                            : 'active:bg-zinc-100 dark:active:bg-zinc-800',
                        )}
                      >
                        <ServiceIcon url={preset.url} icon={preset.icon} />
                        <Text className="flex-1 text-sm text-zinc-900 dark:text-zinc-100" numberOfLines={1}>
                          {preset.title}
                        </Text>
                        <MaterialIcons
                          name={added ? 'check' : 'add'}
                          size={16}
                          color={added ? '#22c55e' : isDark ? colors.icon : colors.iconLightStrong}
                        />
                      </Pressable>
                    )
                  })}
                  {visiblePresetBookmarks.length % 2 === 1 &&
                    rowIndex === Math.floor(visiblePresetBookmarks.length / 2) ? (
                    <View className="min-w-0 flex-1 flex-row items-center gap-2 overflow-hidden rounded-full border border-transparent px-3 py-2 opacity-0" />
                  ) : null}
                </View>
              ))}
            </ScrollView>
          </View>
        </BaseCenterModal>
      ) : null}
      {isIos && providerPickerOpen && providerAnchor ? (
        <Modal transparent visible onRequestClose={() => setProviderPickerOpen(false)}>
          <View className="flex-1" pointerEvents="box-none">
            <Pressable className="absolute inset-0" onPress={() => setProviderPickerOpen(false)} />
            <View
              className="absolute overflow-hidden rounded-2xl border border-zinc-300 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900"
              style={{
                top: Math.min(
                  providerAnchor.y + providerAnchor.height + 6,
                  screenHeight - insets.bottom - Math.min(enabledSearchProviders.length * 56 + 16, 320) - 8,
                ),
                left: Math.min(Math.max(providerAnchor.x - 8, 8), Math.max(8, screenWidth - 240 - 8)),
                width: 240,
                maxHeight: 320,
              }}
            >
              <ScrollView showsVerticalScrollIndicator={false}>
                {enabledSearchProviders.map((provider, idx) => (
                  <Pressable
                    key={provider.id}
                    onPress={() => {
                      settings$.setSelectedSearchProvider(provider.id)
                      setProviderPickerOpen(false)
                    }}
                    className={clsx(
                      'flex-row items-center gap-3 px-4 py-3 active:bg-zinc-200 dark:active:bg-zinc-800',
                      idx !== enabledSearchProviders.length - 1 && 'border-b border-zinc-300 dark:border-zinc-800',
                    )}
                  >
                    <SearchProviderIcon provider={provider} size={20} />
                    <Text className="flex-1 text-sm text-zinc-900 dark:text-white">{provider.name}</Text>
                    {selectedSearchProvider?.id === provider.id ? (
                      <MaterialIcons name="check" size={18} color="#f1f5f9" />
                    ) : null}
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      ) : null}
    </View>
  )
}

export const NavModal = () => {
  const navModalOpen = useValue(ui$.navModalOpen)

  if (!navModalOpen) {
    return null
  }

  return (
    <BaseModal onClose={() => ui$.navModalOpen.set(false)}>
      <NavModalContent />
    </BaseModal>
  )
}
