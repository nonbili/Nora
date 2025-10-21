import { ReactNode, useMemo, useState } from 'react'
import {
  IconBluesky,
  IconFacebook,
  IconInstagram,
  IconLinkedIn,
  IconReddit,
  IconThreads,
  IconTiktok,
  IconTumblr,
  IconTwitter,
  IconVK,
  IconFacebookMessenger,
} from '../icons/Icons'
import { Image } from 'expo-image'
import { Text, TouchableHighlight, View } from 'react-native'
import { clsx } from '@/lib/utils'
import { NouText } from '../NouText'
import { NouSwitch } from '../switch/NouSwitch'
import { settings$ } from '@/states/settings'
import { use$ } from '@legendapp/state/react'
import { hostHomes } from '@/lib/page'

export const services: Record<string, [string, ReactNode]> = {
  bluesky: ['Bluesky', <IconBluesky />],
  facebook: ['Facebook', <IconFacebook />],
  'facebook-messenger': ['Facebook Messenger', <IconFacebookMessenger />],
  instagram: ['Instagram', <IconInstagram />],
  linkedin: ['LinkedIn', <IconLinkedIn />],
  reddit: ['Reddit', <IconReddit />],
  threads: ['Threads', <IconThreads />],
  tiktok: ['Tiktok', <IconTiktok />],
  tumblr: ['Tumblr', <IconTumblr />],
  vk: ['VK', <IconVK />],
  x: ['X', <IconTwitter />],
}

export const ServiceManger = () => {
  const disabledServices = use$(settings$.disabledServices)

  return (
    <View className="">
      {Object.entries(services).map(([value, [label, icon]]) => (
        <NouSwitch
          className="mt-5"
          label={
            <View className="flex-row items-center gap-2">
              {icon}
              <NouText>{label}</NouText>
            </View>
          }
          value={!disabledServices.has(value)}
          key={value}
          onPress={() => settings$.toggleService(value)}
        />
      ))}
    </View>
  )
}

export const ServiceIcon: React.FC<{ url: string }> = ({ url }) => {
  let home: any
  try {
    const { host } = new URL(url)
    home = hostHomes[host]
  } catch (e) {}
  return services[home]?.[1] || <NouText />
}
