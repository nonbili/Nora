import { View, Text, Pressable, ScrollView, TouchableHighlight } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { observer, use$, useObservable } from '@legendapp/state/react'
import { Image } from 'expo-image'
import { ui$ } from '@/states/ui'
import { Picker } from '@expo/ui/jetpack-compose'
import { ReactNode, useMemo, useState } from 'react'
import { getHomeUrl } from '@/lib/page'
import { DrawerContentComponentProps, DrawerContentScrollView } from '@react-navigation/drawer'
import { colors } from '@/lib/colors'
import { settings$ } from '@/states/settings'
import { IconBluesky, IconReddit, IconThreads, IconTumblr, IconTwitter, IconVK } from '../icons/Icons'
import { clsx } from '@/lib/utils'

const items: [string, string, ReactNode][] = [
  ['bluesky', 'Bluesky', <IconBluesky />],
  [
    'facebook',
    'Facebook',
    <Image source={require('@/assets/images/facebook.svg')} style={{ height: 24, width: 24 }} />,
  ],
  [
    'instagram',
    'Instagram',
    <Image source={require('@/assets/images/instagram.svg')} style={{ height: 24, width: 24 }} />,
  ],
  ['reddit', 'Reddit', <IconReddit />],
  ['threads', 'Threads', <IconThreads />],
  ['tumblr', 'Tumblr', <IconTumblr />],
  ['vk', 'VK', <IconVK />],
  ['x', 'X', <IconTwitter />],
]

export function DrawerContent(props: DrawerContentComponentProps) {
  const home = use$(settings$.home)
  const [tabIndex, setTabIndex] = useState(0)

  const setHome = (home: string) => {
    ui$.url.set(getHomeUrl(home))
  }

  return (
    <DrawerContentScrollView {...props}>
      <View className="py-8 pr-6">
        {items.map(([value, label, icon]) => (
          <TouchableHighlight key={value} onPress={() => setHome(value)}>
            <View
              className={clsx(
                'flex-row items-center gap-4 rounded-full py-3 px-5 my-3',
                home == value ? 'bg-emerald-200' : 'bg-sky-50',
              )}
            >
              {icon}
              <Text className="text-lg">{label}</Text>
            </View>
          </TouchableHighlight>
        ))}
      </View>
    </DrawerContentScrollView>
  )
}
