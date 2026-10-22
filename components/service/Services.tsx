import { ReactNode, useEffect, useState } from 'react'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import {
  IconBluesky,
  IconFacebook,
  IconInstagram,
  IconLinkedIn,
  IconMastodon,
  IconReddit,
  IconThreads,
  IconTikTok,
  IconTumblr,
  IconTwitter,
  IconVK,
  IconFacebookMessenger,
} from '../icons/Icons'
import { Image } from 'expo-image'
import { Text, View } from 'react-native'
import { clsx, isWeb } from '@/lib/utils'
import { NouText } from '../NouText'
import { NouSwitch } from '../switch/NouSwitch'
import { settings$ } from '@/states/settings'
import { useValue } from '@legendapp/state/react'
import { hostHomes } from '@/content/css'
import { getFeedTimelineId, isFeedTabUrl } from '@/lib/feed-tab'
import { timelineEmoji } from '@/states/watch'
import { t } from 'i18next'
import { useTwColor } from '@/lib/theme'

export const services: Record<string, [string, () => ReactNode]> = {
  bluesky: ['Bluesky', () => <IconBluesky />],
  facebook: ['Facebook', () => <IconFacebook />],
  'facebook-messenger': ['Facebook Messenger', () => <IconFacebookMessenger />],
  instagram: ['Instagram', () => <IconInstagram />],
  linkedin: ['LinkedIn', () => <IconLinkedIn />],
  reddit: ['Reddit', () => <IconReddit />],
  threads: ['Threads', () => <IconThreads />],
  tiktok: ['TikTok', () => <IconTikTok />],
  tumblr: ['Tumblr', () => <IconTumblr />],
  vk: ['VK', () => <IconVK />],
  x: ['X', () => <IconTwitter />],
}

/** The icon of a site, also of one that is not a service, as Mastodon: it is on many servers. */
export const siteIcon = (site: string) => (site === 'mastodon' ? <IconMastodon /> : services[site]?.[1]())

export const ServiceManager: React.FC<{ hideTitle?: boolean }> = ({ hideTitle = false }) => {
  const disabledServices = useValue(settings$.disabledServicesArr)
  const entries = Object.entries(services)

  return (
    <View className="">
      {!hideTitle ? <NouText className="mb-2">{t('settings.services.title')}</NouText> : null}
      {entries.map(([value, [label, icon]], index) => (
        <View className={clsx('px-4 py-4', index !== entries.length - 1 && 'border-b border-zinc-300 dark:border-zinc-800')} key={value}>
          <NouSwitch
            label={
              <View className="flex-row items-center gap-2">
                {icon()}
                <NouText>{label}</NouText>
              </View>
            }
            value={!disabledServices.includes(value)}
            onPress={() => settings$.toggleService(value)}
          />
        </View>
      ))}
    </View>
  )
}

export const FeedTabIcon: React.FC<{ emoji: string; size?: number }> = ({ emoji, size = 20 }) => {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: Math.max(14, size - 8), lineHeight: size }}>{emoji}</Text>
    </View>
  )
}

export const FeedTabIndicator: React.FC<{ url: string }> = ({ url }) => {
  const tw = useTwColor()
  return isFeedTabUrl(url) ? <MaterialIcons name="rss-feed" size={14} color={tw('#a1a1aa')} /> : null
}

export const ServiceIcon: React.FC<{ url: string; icon?: string }> = ({ url, icon }) => {
  const tw = useTwColor()
  const size = isWeb ? 20 : 24
  const fallbackColor = url ? tw('#52525b') : tw('#a1a1aa')
  const [errored, setErrored] = useState(false)
  // Keep the timeline emoji in the same favicon slot as other tabs.
  const feedEmoji = useValue(() => (isFeedTabUrl(url) ? timelineEmoji(getFeedTimelineId(url)) : ''))

  useEffect(() => {
    setErrored(false)
  }, [icon])

  if (isFeedTabUrl(url)) {
    return <FeedTabIcon emoji={feedEmoji} size={size} />
  }

  if (icon && !errored) {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Image source={icon} style={{ width: size, height: size }} contentFit="contain" onError={() => setErrored(true)} />
      </View>
    )
  }

  let home: any
  try {
    const { host } = new URL(url)
    home = hostHomes[host]
  } catch {}

  const fallback = services[home]?.[1]?.()
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {fallback || <MaterialIcons name="language" size={Math.max(16, size - 4)} color={fallbackColor} />}
    </View>
  )
}
