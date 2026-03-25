import { useState, useEffect } from 'react'
import { View, TextInput } from 'react-native'
import { NouButton } from '../button/NouButton'
import { ui$ } from '@/states/ui'
import { ServiceManager } from '../service/Services'
import { clsx, isWeb, isIos, isAndroid, nIf } from '@/lib/utils'
import { useValue } from '@legendapp/state/react'
import { NouText } from '../NouText'
import { settings$ } from '@/states/settings'
import { Segemented } from '../picker/Segmented'
import { bookmarks$ } from '@/states/bookmarks'
import { Image } from 'expo-image'
import { NouMenu } from '../menu/NouMenu'
import { NouSwitch } from '../switch/NouSwitch'
import { t } from 'i18next'
import { MaterialButton } from '../button/IconButtons'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'

import { ProfileManager } from '../profile/ProfileManager'
import { BlocklistSection } from '../blocklist/BlocklistSection'
import { xHomeTimelineValues } from '@/lib/settings/twitter'

const headerPositions = ['top', 'bottom'] as const
const themes = [null, 'dark', 'light'] as const
const subheaderCls = 'mb-3 text-xs uppercase tracking-[0.18em] text-gray-500'
const surfaceCls = 'overflow-hidden rounded-[24px] border border-zinc-800 bg-zinc-900/70'
const rowCls = 'px-4 py-4'
const rowBorderCls = 'border-b border-zinc-800'
const iconWrapCls = 'h-10 w-10 items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950'
const xTimelineLabels: Record<(typeof xHomeTimelineValues)[number], string> = {
  'for-you': 'settings.xHomeTimeline.forYou',
  following: 'settings.xHomeTimeline.following',
}

export const SettingsBrowsingContent: React.FC = () => {
  const settings = useValue(settings$)
  const xTimelineIndex = xHomeTimelineValues.indexOf(settings.xDefaultHomeTimeline)

  return (
    <View className="pb-4">
      {!isWeb ? (
        <>
          <NouText className={subheaderCls}>{t('settings.browsing.features')}</NouText>
          <View className={surfaceCls}>
            <View className={clsx(rowCls, rowBorderCls)}>
              <NouSwitch
                label={<NouText className="font-medium">{t('settings.openExternalLink')}</NouText>}
                value={settings.openExternalLinkInSystemBrowser}
                onPress={() => settings$.openExternalLinkInSystemBrowser.toggle()}
              />
            </View>
            <View className={clsx(rowCls, rowBorderCls)}>
              <NouSwitch
                label={<NouText className="font-medium">{t('settings.oneTabPerSite')}</NouText>}
                value={settings.oneTabPerSite}
                onPress={() => settings$.oneTabPerSite.toggle()}
              />
            </View>
            <View className={clsx(rowCls, rowBorderCls)}>
              <NouSwitch
                label={<NouText className="font-medium">{t('settings.videoEdgeLongPressTo2x')}</NouText>}
                value={settings.videoEdgeLongPressTo2x}
                onPress={() => settings$.videoEdgeLongPressTo2x.toggle()}
              />
            </View>
          </View>
        </>
      ) : null}

      <View className={clsx(!isWeb && 'mt-10')}>
        <NouText className={subheaderCls}>{t('settings.siteSections.x')}</NouText>
        <View className={surfaceCls}>
          <View className={clsx(rowCls, rowBorderCls)}>
            <NouText className="font-medium">{t('settings.xHomeTimeline.label')}</NouText>
            <View className="mt-3 items-end">
              <Segemented
                options={xHomeTimelineValues.map((value) => t(xTimelineLabels[value]))}
                selectedIndex={Math.max(0, xTimelineIndex)}
                size={1}
                onChange={(index) => settings$.xDefaultHomeTimeline.set(xHomeTimelineValues[index])}
              />
            </View>
          </View>
          <View className={rowCls}>
            <NouSwitch
              label={<NouText className="font-medium">{t('settings.hideXHomeTimelineTabs')}</NouText>}
              value={settings.hideXHomeTimelineTabs}
              onPress={() => settings$.hideXHomeTimelineTabs.toggle()}
            />
          </View>
        </View>
      </View>

      {!isWeb ? (
        <View className="mt-10">
          <NouText className={subheaderCls}>{t('settings.siteSections.reddit')}</NouText>
          <View className={surfaceCls}>
            <View className={rowCls}>
              <NouSwitch
                label={<NouText className="font-medium">{t('settings.redirectToOldReddit')}</NouText>}
                value={settings.redirectToOldReddit}
                onPress={() => settings$.redirectToOldReddit.toggle()}
              />
            </View>
          </View>
        </View>
      ) : null}

      <View className="mt-10">
        <NouText className={subheaderCls}>{t('blocklist.label')}</NouText>
        <View className={surfaceCls}>
          <View className={rowCls}>
            <BlocklistSection hideTitle />
          </View>
        </View>
      </View>

      {!isWeb ? (
        <View className="mt-10">
          <NouText className={subheaderCls}>{t('settings.sections.advanced')}</NouText>
          <View className={surfaceCls}>
            {nIf(
              isAndroid,
              <View className={clsx(rowCls, rowBorderCls)}>
                <NouSwitch
                  label={<NouText className="font-medium">{t('settings.allowHttpWebsite')}</NouText>}
                  value={settings.allowHttpWebsite}
                  onPress={() => settings$.allowHttpWebsite.toggle()}
                />
              </View>,
            )}
            <View className={rowCls}>
              <NouSwitch
                label={<NouText className="font-medium">{t('settings.inspectable')}</NouText>}
                value={settings.inspectable}
                onPress={() => settings$.inspectable.toggle()}
              />
            </View>
          </View>
        </View>
      ) : null}
    </View>
  )
}

export const SettingsAppearanceContent = () => {
  const settings = useValue(settings$)
  const [deckTabWidthInput, setDeckTabWidthInput] = useState(settings.deckTabWidth.toString())

  useEffect(() => {
    setDeckTabWidthInput(settings.deckTabWidth.toString())
  }, [settings.deckTabWidth])

  const submitDeckTabWidth = () => {
    const parsed = parseInt(deckTabWidthInput, 10)
    if (!isNaN(parsed) && parsed > 0) {
      settings$.deckTabWidth.set(parsed)
      setDeckTabWidthInput(parsed.toString())
    } else {
      setDeckTabWidthInput(settings.deckTabWidth.toString())
    }
  }

  return (
    <>
      {nIf(
        isWeb,
        <View className="pb-4">
          <NouText className={subheaderCls}>{t('settings.appearance.toolbar')}</NouText>
          <View className={surfaceCls}>
            <View className={clsx('items-center flex-row justify-between', rowCls)}>
              <View>
                <NouText className="font-medium">{t('settings.appearance.deckTabWidth')}</NouText>
                <NouText className="mt-1 text-sm leading-5 text-zinc-400">
                  {t('settings.appearance.deckTabWidthHint', { value: settings.deckTabWidth })}
                </NouText>
              </View>
              <View className="flex-row items-center gap-2">
                <TextInput
                  className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-white w-24 text-center"
                  value={deckTabWidthInput}
                  onChangeText={setDeckTabWidthInput}
                  onEndEditing={submitDeckTabWidth}
                  onSubmitEditing={submitDeckTabWidth}
                  keyboardType="numeric"
                  returnKeyType="done"
                />
                <NouMenu
                  trigger={isWeb ? <MaterialButton name="more-vert" /> : isIos ? 'ellipsis' : 'filled.MoreVert'}
                  items={[
                    {
                      label: t('common.reset'),
                      handler: () => {
                        settings$.deckTabWidth.set(400)
                      },
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        </View>,
      )}
      {nIf(
        !isWeb,
        <View className="pb-4">
          <NouText className={subheaderCls}>{t('common.theme')}</NouText>
          <View className={surfaceCls}>
            <View className="px-4 py-4">
              <View className="flex-row items-start gap-3">
                <View className={iconWrapCls}>
                  <MaterialIcons name="palette" color="#d4d4d8" size={18} />
                </View>
                <View className="flex-1">
                  <NouText className="font-medium">{t('common.theme')}</NouText>
                  <NouText className="mt-1 text-sm leading-5 text-zinc-400">{t('settings.theme.hint')}</NouText>
                </View>
              </View>
            </View>
            <View className="border-t border-zinc-800 px-4 py-4">
              <View className="items-end">
                <Segemented
                  options={[t('settings.theme.system'), t('settings.theme.dark'), t('settings.theme.light')]}
                  selectedIndex={themes.indexOf(settings.theme)}
                  size={1}
                  onChange={(index) => settings$.theme.set(themes[index])}
                />
              </View>
            </View>
          </View>

          <NouText className="mt-8 mb-3 text-xs uppercase tracking-[0.18em] text-gray-500">{t('settings.appearance.toolbar')}</NouText>
          <View className={surfaceCls}>
            <View className={clsx('items-center flex-row justify-between', rowCls, rowBorderCls)}>
              <NouText className="font-medium">{t('settings.headerPosition.label')}</NouText>
              <Segemented
                options={[t('settings.headerPosition.top'), t('settings.headerPosition.bottom')]}
                selectedIndex={headerPositions.indexOf(settings.headerPosition)}
                size={1}
                onChange={(index) => settings$.headerPosition.set(headerPositions[index])}
              />
            </View>
            <View className={clsx(rowCls, rowBorderCls)}>
              <NouSwitch
                label={<NouText className="font-medium">{t('settings.hideHeader')}</NouText>}
                value={settings.autoHideHeader}
                onPress={() => settings$.autoHideHeader.toggle()}
              />
            </View>
            <View className={clsx(rowCls, rowBorderCls)}>
              <NouSwitch
                label={<NouText className="font-medium">{t('settings.showNewTabButton')}</NouText>}
                value={settings.showNewTabButtonInHeader}
                onPress={() => settings$.showNewTabButtonInHeader.toggle()}
              />
            </View>
            <View className={clsx(rowCls, rowBorderCls)}>
              <NouSwitch
                label={<NouText className="font-medium">{t('settings.showBackButton')}</NouText>}
                value={settings.showBackButtonInHeader}
                onPress={() => settings$.showBackButtonInHeader.toggle()}
              />
            </View>
            <View className={clsx(rowCls, rowBorderCls)}>
              <NouSwitch
                label={<NouText className="font-medium">{t('settings.showForwardButton')}</NouText>}
                value={settings.showForwardButtonInHeader}
                onPress={() => settings$.showForwardButtonInHeader.toggle()}
              />
            </View>
            <View className={clsx(rowCls, rowBorderCls)}>
              <NouSwitch
                label={<NouText className="font-medium">{t('settings.showReloadButton')}</NouText>}
                value={settings.showReloadButtonInHeader}
                onPress={() => settings$.showReloadButtonInHeader.toggle()}
              />
            </View>
            <View className={rowCls}>
              <NouSwitch
                label={<NouText className="font-medium">{t('settings.showScrollButton')}</NouText>}
                value={settings.showScrollButtonInHeader}
                onPress={() => settings$.showScrollButtonInHeader.toggle()}
              />
            </View>
          </View>
        </View>,
      )}
    </>
  )
}

export const SettingsProfilesContent = () => {
  return (
    <View className="pb-4">
      <ProfileManager />
      {nIf(
        !isWeb,
        <View className="mt-10">
          <NouText className={subheaderCls}>{t('settings.profiles.injectCookie')}</NouText>
          <View className={surfaceCls}>
            <View className="px-4 py-4">
              <NouText className="text-sm leading-6 text-gray-400">
                {t('settings.profiles.injectCookieHint')}
              </NouText>
              <View className="mt-5 flex-row justify-end">
                <NouButton variant="outline" onPress={() => ui$.cookieModalOpen.set(true)}>
                  {t('settings.injectCookie')}
                </NouButton>
              </View>
            </View>
          </View>
        </View>,
      )}
    </View>
  )
}

export const SettingsBookmarksContent = () => {
  const bookmarks = useValue(bookmarks$.bookmarks)

  return (
    <View className="pb-4">
      <View>
        <NouText className={subheaderCls}>{t('settings.bookmarks.builtin')}</NouText>
        <View className={surfaceCls}>
          <ServiceManager hideTitle />
        </View>
      </View>
      <View className="mt-10">
        <NouText className={subheaderCls}>{t('settings.bookmarks.saved')}</NouText>
        <View className={surfaceCls}>
          {!bookmarks.length ? <NouText className="px-4 py-4 text-sm text-gray-500">{t('settings.bookmarks.empty')}</NouText> : null}
          {bookmarks.map((bookmark, index) => (
            <View className={clsx('flex-row items-center justify-between gap-5 px-4 py-4', index !== bookmarks.length - 1 && 'border-b border-zinc-800')} key={index}>
              <View className="flex-row items-center gap-2 w-[70%]">
                <Image source={bookmark.icon} style={{ width: 24, height: 24 }} />
                <NouText numberOfLines={1}>{bookmark.title}</NouText>
              </View>
              <NouMenu
                trigger={isWeb ? <MaterialButton name="more-vert" /> : isIos ? 'ellipsis' : 'filled.MoreVert'}
                items={[{ label: t('menus.delete'), handler: () => bookmarks$.deleteBookmark(index) }]}
              />
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}
