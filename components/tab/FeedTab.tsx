import { useEffect } from 'react'
import { View } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { t } from 'i18next'
import { ui$ } from '@/states/ui'
import { settings$ } from '@/states/settings'
import { tabs$ } from '@/states/tabs'
import { getTimeline, timelineEmoji } from '@/states/watch'
import { getFeedTimelineId } from '@/lib/feed-tab'
import { FeedTabIcon, FeedTabIndicator } from '@/components/service/Services'
import { clsx, isAndroid, isWeb, nIf } from '@/lib/utils'
import { NouText } from '../NouText'
import { MaterialButton } from '../button/IconButtons'
import { FeedView } from '../feed/FeedView'
import { useTabAnimation } from './tab-animation'
import type { NoraTabProps } from './NoraTab'

const toolbarButtonStyle = { padding: 4, height: 28 }

/** A tab that shows the feed of watched profiles instead of a web page. */
export const FeedTab: React.FC<NoraTabProps> = ({
  tab,
  index,
  isActive = false,
  desktopChrome = false,
  desktopVisible = true,
  desktopVariant = 'deck',
  slotSwitcher,
}) => {
  const autoHideHeader = useValue(settings$.autoHideHeader)
  const doubleTapToToggleHeader = useValue(settings$.doubleTapToToggleHeader)
  const hideToolbarWhenScrolled = useValue(settings$.hideToolbarWhenScrolled)
  const headerHeight = useValue(ui$.headerHeight)
  const headerShown = useValue(ui$.headerShown)
  const headerPosition = useValue(settings$.headerPosition)
  const deckTabWidth = useValue(settings$.deckTabWidth)
  const hideableHeader = autoHideHeader || hideToolbarWhenScrolled || (isAndroid && doubleTapToToggleHeader)
  const { Root: TabRoot, style: tabAnimationStyle } = useTabAnimation({
    headerHeight,
    headerShown,
    hideableHeader,
    headerPosition,
  })
  const shown = isWeb || desktopChrome ? desktopVisible : isActive
  const timelineId = getFeedTimelineId(tab.url)
  const timelineName = useValue(() => getTimeline(timelineId)?.name)
  const label = timelineName || t('feed.label')
  const emoji = useValue(() => timelineEmoji(timelineId))

  // Nothing loads here: the tab is ready as soon as it is there, and is not put to sleep.
  useEffect(() => {
    const tabIndex = tabs$.tabs.peek().findIndex((current) => current?.id === tab.id)
    if (tabIndex !== -1) {
      tabs$.tabs[tabIndex].assign({ isLoading: false, isDormant: false, title: label })
    }
  }, [tab.id, tab.isLoading, tab.isDormant, tab.title, label])

  // The header's back and the tabs left dormant on start would wait for a webview this tab
  // does not have. Nor can its list bring back a toolbar a page scrolled away, so it is shown.
  useEffect(() => {
    if (!isActive) return
    ui$.headerShown.set(true)
    ui$.webview.set(undefined)
    ui$.activeCanGoBack.set(false)
    tabs$.wakeDormantTabs()
  }, [isActive])

  const chrome = (
    <View
      className={clsx(
        'flex-row items-center justify-between gap-2 border-b pl-2 pr-1',
        isActive
          ? 'bg-indigo-100 border-indigo-200 dark:bg-indigo-400/30 dark:border-indigo-300/50'
          : 'bg-zinc-50 border-zinc-300 dark:bg-zinc-800 dark:border-zinc-700/50',
      )}
      style={{ borderLeftWidth: 4, borderLeftColor: 'transparent', height: 36 }}
    >
      <View className="min-w-0 flex-1 flex-row items-center justify-center">
        {slotSwitcher || (
          <View className="min-w-0 max-w-full flex-row items-center justify-center gap-2 px-2">
            <FeedTabIcon emoji={emoji} size={20} />
            <NouText
              className={clsx(
                'min-w-0 flex-1 text-center text-[11px] font-bold tracking-wider',
                isActive ? 'text-zinc-600 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400',
              )}
              numberOfLines={1}
            >
              {label}
            </NouText>
          </View>
        )}
      </View>
      <FeedTabIndicator url={tab.url} />
      <MaterialButton name="close" onPress={() => tabs$.closeTab(index)} style={toolbarButtonStyle} size={16} />
    </View>
  )

  if (isWeb) {
    return (
      <View
        className={clsx(
          'flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-white shadow-md shadow-zinc-900/10 dark:bg-zinc-900',
          isActive
            ? 'border-indigo-400/60 ring-2 ring-indigo-500/10 dark:border-indigo-400/50'
            : 'border-zinc-300 dark:border-zinc-800',
          desktopVariant === 'deck' ? 'shrink-0' : 'w-full',
        )}
        style={desktopVariant === 'deck' ? { width: deckTabWidth } : undefined}
      >
        {chrome}
        <FeedView tabId={tab.id} timelineId={timelineId} active={shown} focused={isActive} />
      </View>
    )
  }

  return (
    <TabRoot
      pointerEvents={desktopChrome || isActive ? 'auto' : 'none'}
      className={clsx(
        desktopChrome && 'h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border bg-white dark:bg-zinc-900',
        desktopChrome &&
          (isActive ? 'border-indigo-400/60 dark:border-indigo-400/50' : 'border-zinc-300 dark:border-zinc-800'),
      )}
      style={
        desktopChrome
          ? undefined
          : [
              {
                position: 'absolute',
                left: 0,
                right: 0,
                top: 0,
                bottom: 0,
                opacity: isActive ? 1 : 0,
                zIndex: isActive ? 1 : 0,
              },
              tabAnimationStyle,
            ]
      }
    >
      {nIf(desktopChrome, chrome)}
      <FeedView tabId={tab.id} timelineId={timelineId} active={shown} focused={isActive} />
    </TabRoot>
  )
}
