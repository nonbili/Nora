import { useMemo, useState } from 'react'
import { TextInput, View } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { t } from 'i18next'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { NouText } from '../NouText'
import { NouButton } from '../button/NouButton'
import { tabs$ } from '@/states/tabs'
import { settingsUi } from '../modal/SettingsPrimitives'
import {
  usageLimits$,
  limitMatchesService,
  getLimitUsageToday,
  isLimitBypassedToday,
} from '@/states/usage-limits'
import { resolveServiceFromUrl, formatMinutes } from '@/lib/usage-limits'

export const UsageLockout: React.FC = () => {
  const tabs = useValue(tabs$.tabs)
  const activeIndex = useValue(tabs$.activeTabIndex)
  const limits = useValue(usageLimits$.limits)
  const usage = useValue(usageLimits$.usage)
  const bypassed = useValue(usageLimits$.bypassed)
  const pin = useValue(usageLimits$.pin)
  void usage
  void bypassed

  const activeTab = tabs[activeIndex]
  const service = resolveServiceFromUrl(activeTab?.url)

  const trippedLimit = useMemo(() => {
    if (!service) return null
    for (const limit of limits) {
      if (!limit) continue
      if (!limitMatchesService(limit, service)) continue
      if (isLimitBypassedToday(limit.id)) continue
      const used = getLimitUsageToday(limit.id)
      if (used >= limit.dailyMinutes) return limit
    }
    return null
  }, [limits, service])

  const [entered, setEntered] = useState('')
  const [error, setError] = useState(false)

  if (!trippedLimit) return null

  const used = getLimitUsageToday(trippedLimit.id)
  const onUnlock = () => {
    if (!pin) return
    if (entered === pin) {
      usageLimits$.bypassToday(trippedLimit.id)
      setEntered('')
      setError(false)
    } else {
      setError(true)
    }
  }

  return (
    <View className="absolute inset-0 z-50 bg-zinc-100 dark:bg-zinc-950 px-6 items-center justify-center">
      <View className="w-full max-w-sm gap-4">
        <View className="items-center">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-500/15">
            <MaterialIcons name="hourglass-bottom" size={44} color="#6366f1" />
          </View>
        </View>
        <NouText className="text-2xl font-semibold text-center">
          {t('usageLimits.lockout.title')}
        </NouText>
        <NouText className="text-center text-zinc-600 dark:text-zinc-400">
          {t('usageLimits.lockout.body', {
            name: trippedLimit.name,
            limit: formatMinutes(trippedLimit.dailyMinutes),
            used: formatMinutes(used),
          })}
        </NouText>
        {pin ? (
          <View className="gap-2">
            <TextInput
              className={settingsUi.textInputCls}
              placeholder={t('usageLimits.lockout.pinPlaceholder')}
              placeholderTextColor="#71717a"
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              value={entered}
              onChangeText={(v) => {
                setEntered(v)
                setError(false)
              }}
              onSubmitEditing={onUnlock}
            />
            {error ? (
              <NouText className="text-sm text-red-600 dark:text-red-400">
                {t('usageLimits.lockout.pinIncorrect')}
              </NouText>
            ) : null}
            <NouButton onPress={onUnlock}>{t('usageLimits.lockout.unlock')}</NouButton>
          </View>
        ) : (
          <NouText className="text-center text-sm text-zinc-600 dark:text-zinc-400">
            {t('usageLimits.lockout.noPinHint')}
          </NouText>
        )}
      </View>
    </View>
  )
}
