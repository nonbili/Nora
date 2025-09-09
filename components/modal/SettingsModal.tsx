import { Button, Text, Pressable, View, Switch, TouchableOpacity, ActivityIndicator } from 'react-native'
import { NouText } from '../NouText'
import { NouLink } from '../NouLink'
import { version } from '../../package.json'
import { useState } from 'react'
import { colors } from '@/lib/colors'
import { clsx } from '@/lib/utils'
import { use$ } from '@legendapp/state/react'
import { settings$ } from '@/states/settings'
import { Segemented } from '../picker/Segmented'
import { ui$ } from '@/states/ui'
import { BaseModal } from './BaseModal'
import { ServiceManger } from '../service/Services'
import { NouButton } from '../button/NouButton'

const repo = 'https://github.com/nonbili/Nora'
const tabs = ['Settings', 'About']
const themes = [null, 'dark', 'light'] as const

export const SettingsModal = () => {
  const settingsModalOpen = use$(ui$.settingsModalOpen)
  const onClose = () => ui$.settingsModalOpen.set(false)
  const [tabIndex, setTabIndex] = useState(0)
  const settings = use$(settings$)

  if (!settingsModalOpen) {
    return null
  }

  return (
    <BaseModal onClose={() => ui$.settingsModalOpen.set(false)}>
      <View className="py-6 px-4">
        <View className="items-center">
          <Segemented options={tabs} selectedIndex={tabIndex} onChange={setTabIndex} />
        </View>
        <View className="mt-4">
          {tabIndex == 0 && (
            <>
              <View className="my-8">
                <View className="items-center flex-row justify-between">
                  <NouText className="font-medium">Theme</NouText>
                  <Segemented
                    options={['System', 'Dark', 'Light']}
                    selectedIndex={themes.indexOf(settings.theme)}
                    size={1}
                    onChange={(index) => settings$.theme.set(themes[index])}
                  />
                </View>
                <NouText className="mt-2 text-sm text-gray-400 text-right">
                  Restart manually if change not reflected in webview.
                </NouText>
              </View>
              <View className="flex-row justify-center mb-8">
                <NouButton variant="outline" onPress={() => ui$.cookieModalOpen.set(true)}>
                  Inject cookie
                </NouButton>
              </View>
              <ServiceManger />
            </>
          )}
          {tabIndex == 1 && (
            <>
              <View className="items-center my-4">
                <NouText className="text-lg font-medium">Nora</NouText>
                <NouText>v{version}</NouText>
              </View>
              <View className="">
                <NouText className="font-medium">Source code</NouText>
                <NouLink className="text-blue-300" href={repo}>
                  {repo}
                </NouLink>
              </View>
            </>
          )}
        </View>
      </View>
    </BaseModal>
  )
}
