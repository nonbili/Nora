import { Button, Text, Pressable, View, Switch, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native'
import { NouText } from '../NouText'
import { NouLink } from '../link/NouLink'
import { version } from '../../package.json'
import { version as desktopVersion } from '../../desktop/package.json'
import { useState } from 'react'
import { colors } from '@/lib/colors'
import { clsx, isWeb, nIf } from '@/lib/utils'
import { useValue } from '@legendapp/state/react'
import { settings$ } from '@/states/settings'
import { Segemented } from '../picker/Segmented'
import { ui$ } from '@/states/ui'
import { BaseModal } from './BaseModal'
import { ServiceManager } from '../service/Services'
import { NouButton } from '../button/NouButton'
import { SettingsModalTabSettings } from './SettingsModalTabSettings'

const repo = 'https://github.com/nonbili/Nora'
const tabs = ['Settings', 'About']
const donateLinks = ['https://github.com/sponsors/rnons', 'https://liberapay.com/rnons', 'https://paypal.me/rnons']

export const SettingsModal = () => {
  const settingsModalOpen = useValue(ui$.settingsModalOpen)
  const onClose = () => ui$.settingsModalOpen.set(false)
  const [tabIndex, setTabIndex] = useState(0)
  const settings = useValue(settings$)

  if (!settingsModalOpen) {
    return null
  }

  return (
    <BaseModal onClose={() => ui$.settingsModalOpen.set(false)}>
      <View className="py-6 px-4">
        <View className="items-center">
          <Segemented options={tabs} selectedIndex={tabIndex} onChange={setTabIndex} />
        </View>
        <ScrollView className="mt-4">
          {nIf(tabIndex == 0, <SettingsModalTabSettings />)}
          {nIf(
            tabIndex == 1,
            <>
              <View className="items-center my-4">
                <NouText className="text-lg font-medium">Nora</NouText>
                <NouText>v{isWeb ? desktopVersion : version}</NouText>
              </View>
              <View className="mb-6">
                <NouText className="font-medium mb-1">Source code</NouText>
                <NouLink className="text-indigo-400 text-sm" href={repo}>
                  {repo}
                </NouLink>
              </View>
              <View className="mb-6">
                <NouText className="font-medium mb-1">Donate</NouText>
                {donateLinks.map((url) => (
                  <NouLink className="text-indigo-400 text-sm mb-2" href={url} key={url}>
                    {url}
                  </NouLink>
                ))}
              </View>
            </>,
          )}
          <View className="h-20" />
        </ScrollView>
      </View>
    </BaseModal>
  )
}
