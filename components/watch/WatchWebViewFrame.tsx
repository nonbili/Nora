import { Pressable, View } from 'react-native'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { t } from 'i18next'
import { NouText } from '../NouText'
import { useTwColor } from '@/lib/theme'
import { androidHitSlop, iosTouchTarget } from '@/lib/utils'
import { cancelWatchWebView, type WatchWebViewJob } from '@/lib/watch-webview'

/**
 * Where the webview that reads watched profiles is: out of sight, or over the whole app for a
 * page the user is to pass a site's check for a browser on, with a bar to close it.
 */
export const WatchWebViewFrame: React.FC<{ job: WatchWebViewJob; children: React.ReactNode }> = ({ job, children }) => {
  const tw = useTwColor()
  const insets = useSafeAreaInsets()
  if (!job.visible) {
    return (
      <View pointerEvents="none" style={{ position: 'absolute', left: -2000, top: 0, width: 1280, height: 900, opacity: 0 }}>
        {children}
      </View>
    )
  }
  return (
    <View
      className="bg-white dark:bg-zinc-900"
      style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 1000, elevation: 1000, paddingTop: insets.top, paddingBottom: insets.bottom }}
    >
      <View className="flex-row items-center border-b border-zinc-200 py-1 pl-4 pr-1 dark:border-zinc-800">
        <NouText className="flex-1 text-sm text-zinc-600 dark:text-zinc-300">{t('feed.verifyTitle')}</NouText>
        <Pressable
          onPress={() => cancelWatchWebView(job.id)}
          accessibilityRole="button"
          accessibilityLabel={t('menus.close')}
          hitSlop={androidHitSlop}
          style={iosTouchTarget}
          className="h-10 w-10 items-center justify-center"
        >
          <MaterialIcons name="close" size={22} color={tw('#52525b')} />
        </Pressable>
      </View>
      <View className="flex-1">{children}</View>
    </View>
  )
}
