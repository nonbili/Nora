import { Platform, Pressable, Switch, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { useValue } from '@legendapp/state/react'
import { t } from 'i18next'
import { NouText } from '../NouText'
import { clsx } from '@/lib/utils'
import { userStyles$ } from '@/states/user-styles'
import { ui$ } from '@/states/ui'
import { UserStyleEditModal } from './UserStyleEditModal'
import { UserScriptEditModal } from './UserScriptEditModal'

const surfaceCls = 'overflow-hidden rounded-[24px] border border-zinc-300 dark:border-zinc-800 bg-zinc-100/80 dark:bg-zinc-900/70'
const subheaderCls = 'mb-3 text-xs uppercase tracking-[0.18em] text-zinc-600 dark:text-gray-500'
const rowCls = 'px-4 py-4'
const rowBorderCls = 'border-b border-zinc-300 dark:border-zinc-800'
const switchColors = {
  trackColor: { false: '#d4d4d8', true: '#4f46e5' },
  thumbColor: '#ffffff',
}

const formatHostGlobs = (hostGlobs: string[]) => hostGlobs.join(', ')

export const SettingsUserStylesContent = () => {
  const customStyles = useValue(userStyles$.customStyles)
  const customScripts = useValue(userStyles$.customScripts)
  const userStyleModalOpen = useValue(ui$.userStyleModalOpen)
  const userScriptModalOpen = useValue(ui$.userScriptModalOpen)
  const hasStyles = customStyles.length > 0
  const hasScripts = customScripts.length > 0

  const startAddCustomStyle = () => {
    ui$.editingUserStyleId.set(null)
    ui$.userStyleModalOpen.set(true)
  }

  const startEditCustomStyle = (id: string) => {
    ui$.editingUserStyleId.set(id)
    ui$.userStyleModalOpen.set(true)
  }

  const startAddCustomScript = () => {
    ui$.editingUserScriptId.set(null)
    ui$.userScriptModalOpen.set(true)
  }

  const startEditCustomScript = (id: string) => {
    ui$.editingUserScriptId.set(id)
    ui$.userScriptModalOpen.set(true)
  }

  if (userStyleModalOpen) {
    return <UserStyleEditModal inline />
  }

  if (userScriptModalOpen) {
    return <UserScriptEditModal inline />
  }

  return (
    <View className="gap-8 pb-4">
      <View>
        <View className="mb-3 flex-row items-center justify-between">
          <NouText className={subheaderCls}>{t('settings.userStyles.custom.label')}</NouText>
          <Pressable
            onPress={startAddCustomStyle}
            className="flex-row items-center gap-1 rounded-full bg-indigo-600/10 px-3 py-1.5 active:bg-indigo-600/20"
          >
            <MaterialIcons name="add" color="#818cf8" size={18} />
            <NouText className="text-xs font-semibold text-indigo-400">{t('settings.userStyles.add')}</NouText>
          </Pressable>
        </View>
        <View className={surfaceCls}>
          {!hasStyles ? (
            <View className="items-center justify-center px-6 py-10">
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-zinc-200 dark:bg-zinc-950">
                <MaterialIcons name="brush" color="#3f3f46" size={24} />
              </View>
              <NouText className="mt-4 text-center text-sm leading-6 text-zinc-600 dark:text-zinc-500">
                {t('settings.userStyles.custom.empty')}
              </NouText>
            </View>
          ) : null}
          {customStyles.map((style, index) => (
            <Pressable
              key={style.id}
              onPress={() => startEditCustomStyle(style.id)}
              className={clsx(
                rowCls,
                'flex-row items-center justify-between active:bg-zinc-200/50 dark:active:bg-zinc-800/50',
                index !== customStyles.length - 1 && rowBorderCls,
              )}
            >
              <View className="flex-1 pr-4">
                <NouText className={clsx('font-medium', !style.enabled && 'text-zinc-600 dark:text-zinc-500')} numberOfLines={1}>
                  {style.name}
                </NouText>
                <View className="mt-1.5 flex-row items-center gap-1.5">
                  <MaterialIcons name="language" color="#71717a" size={12} />
                  <NouText className="flex-1 text-xs text-zinc-600 dark:text-zinc-400" numberOfLines={1}>
                    {formatHostGlobs(style.hostGlobs)}
                  </NouText>
                </View>
              </View>
              <Switch
                value={style.enabled}
                onValueChange={() => userStyles$.toggleCustomStyle(style.id)}
                trackColor={switchColors.trackColor}
                thumbColor={switchColors.thumbColor}
                {...Platform.select({
                  web: { activeThumbColor: switchColors.thumbColor },
                  ios: { style: { transform: [{ scale: 0.7 }] } },
                })}
              />
            </Pressable>
          ))}
        </View>
      </View>

      <View>
        <View className="mb-3 flex-row items-center justify-between">
          <NouText className={subheaderCls}>{t('settings.userStyles.scripts.label')}</NouText>
          <Pressable
            onPress={startAddCustomScript}
            className="flex-row items-center gap-1 rounded-full bg-indigo-600/10 px-3 py-1.5 active:bg-indigo-600/20"
          >
            <MaterialIcons name="add" color="#818cf8" size={18} />
            <NouText className="text-xs font-semibold text-indigo-400">{t('settings.userStyles.scripts.add')}</NouText>
          </Pressable>
        </View>
        <View className={surfaceCls}>
          {!hasScripts ? (
            <View className="items-center justify-center px-6 py-10">
              <View className="h-12 w-12 items-center justify-center rounded-2xl bg-zinc-200 dark:bg-zinc-950">
                <MaterialIcons name="code" color="#3f3f46" size={24} />
              </View>
              <NouText className="mt-4 text-center text-sm leading-6 text-zinc-600 dark:text-zinc-500">
                {t('settings.userStyles.scripts.empty')}
              </NouText>
            </View>
          ) : null}
          {customScripts.map((script, index) => (
            <Pressable
              key={script.id}
              onPress={() => startEditCustomScript(script.id)}
              className={clsx(
                rowCls,
                'flex-row items-center justify-between active:bg-zinc-200/50 dark:active:bg-zinc-800/50',
                index !== customScripts.length - 1 && rowBorderCls,
              )}
            >
              <View className="flex-1 pr-4">
                <NouText className={clsx('font-medium', !script.enabled && 'text-zinc-600 dark:text-zinc-500')} numberOfLines={1}>
                  {script.name}
                </NouText>
                <View className="mt-1.5 flex-row items-center gap-1.5">
                  <MaterialIcons name="language" color="#71717a" size={12} />
                  <NouText className="flex-1 text-xs text-zinc-600 dark:text-zinc-400" numberOfLines={1}>
                    {formatHostGlobs(script.hostGlobs)}
                  </NouText>
                </View>
              </View>
              <Switch
                value={script.enabled}
                onValueChange={() => userStyles$.toggleCustomScript(script.id)}
                trackColor={switchColors.trackColor}
                thumbColor={switchColors.thumbColor}
                {...Platform.select({
                  web: { activeThumbColor: switchColors.thumbColor },
                  ios: { style: { transform: [{ scale: 0.7 }] } },
                })}
              />
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  )
}
