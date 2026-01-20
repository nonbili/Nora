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
import { t } from 'i18next'
import { SettingsModalTabSync } from './SettingsModalTabSync'

const repo = 'https://github.com/nonbili/Nora'
const tabs = [t('settings.label'), t('sync.label'), t('about.label')]
const donateLinks = ['https://github.com/sponsors/rnons', 'https://liberapay.com/rnons', 'https://paypal.me/rnons']

function renderTab(tabIndex: number) {
  switch (tabIndex) {
    case 0:
      return <SettingsModalTabSettings />
    case 1:
      return <SettingsModalTabSync />
    case 2:
      return (
        <>
          <View className="items-center my-4">
            <NouText className="text-lg font-medium">Nora</NouText>
            <NouText>v{isWeb ? desktopVersion : version}</NouText>
          </View>
          <View className="mb-6">
            <NouText className="font-medium mb-1">{t('about.code')}</NouText>
            <NouLink className="text-indigo-400 text-sm" href={repo}>
              {repo}
            </NouLink>
          </View>
          <View className="mb-6">
            <NouText className="font-medium mb-1">{t('about.donate')}</NouText>
            {donateLinks.map((url) => (
              <NouLink className="text-indigo-400 text-sm mb-2" href={url} key={url}>
                {url}
              </NouLink>
            ))}
          </View>
        </>
      )
  }
}

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
      <View className="pt-6 h-full">
        <View className="items-center">
          <Segemented options={tabs} selectedIndex={tabIndex} onChange={setTabIndex} />
        </View>
        <ScrollView className="mt-4 px-4">
          {renderTab(tabIndex)}
          <View className="h-10" />
        </ScrollView>
      </View>
    </BaseModal>
  )
}
