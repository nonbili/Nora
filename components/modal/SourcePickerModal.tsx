import { Pressable, ScrollView, View } from 'react-native'
import { useValue } from '@legendapp/state/react'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { t } from 'i18next'
import { BaseCenterModal } from './BaseCenterModal'
import { NouButton } from '../button/NouButton'
import { NouText } from '../NouText'
import { formatInterval } from '../feed/FeedView'
import { ui$ } from '@/states/ui'
import { watch$ } from '@/states/watch'
import { WATCH_INTERVAL_OPTIONS, watchSourceLabel } from '@/lib/watch'
import { useTwColor } from '@/lib/theme'
import { androidHitSlop, iosTouchTarget } from '@/lib/utils'

const Row: React.FC<{ icon: string; iconColor: string; label: string; checked?: boolean; role: 'checkbox' | 'radio' | 'button'; onPress: () => void }> = ({
  icon,
  iconColor,
  label,
  checked,
  role,
  onPress,
}) => (
  <Pressable
    onPress={onPress}
    hitSlop={androidHitSlop}
    accessibilityRole={role}
    accessibilityState={role === 'button' ? undefined : { checked }}
    className="flex-row items-center gap-3 py-2"
    style={iosTouchTarget}
  >
    <MaterialIcons name={icon as any} size={22} color={iconColor} />
    <NouText className="flex-1" numberOfLines={1}>
      {label}
    </NouText>
  </Pressable>
)

/** The timelines a watched source is in, or how often it is checked, chosen from its menu in the feed. */
export const SourcePickerModal = () => {
  const tw = useTwColor()
  const picker = useValue(ui$.sourcePicker)
  const profile = useValue(() => watch$.profiles.get().find((current) => current.key === picker?.profileKey))
  const timelines = useValue(watch$.timelines)
  const defaultInterval = useValue(watch$.checkIntervalMinutes)

  const onClose = () => ui$.sourcePicker.set(null)

  if (!picker || !profile) {
    return null
  }

  const on = tw('#6366f1')
  const off = tw('#a1a1aa')

  const intervals = [
    { label: t('feed.intervalDefault', { interval: formatInterval(defaultInterval) }), minutes: undefined },
    ...WATCH_INTERVAL_OPTIONS.map((minutes) => ({ label: formatInterval(minutes), minutes })),
  ]

  return (
    <BaseCenterModal onClose={onClose}>
      <View className="w-full p-4" style={{ flexShrink: 1 }}>
        <NouText className="text-lg font-bold">{picker.kind === 'timelines' ? t('feed.timelines') : t('feed.checkEvery')}</NouText>
        <NouText className="mb-3 text-sm text-zinc-600 dark:text-zinc-400" numberOfLines={1}>
          {profile.name || watchSourceLabel(profile)}
        </NouText>
        <ScrollView style={{ maxHeight: 360 }}>
          {picker.kind === 'timelines' ? (
            <>
              {timelines.map((timeline) => {
                const included = timeline.profileKeys.includes(profile.key)
                return (
                  <Row
                    key={timeline.id}
                    icon={included ? 'check-box' : 'check-box-outline-blank'}
                    iconColor={included ? on : off}
                    label={timeline.name}
                    checked={included}
                    role="checkbox"
                    onPress={() => watch$.setInTimeline(timeline.id, profile.key, !included)}
                  />
                )
              })}
              <Row
                icon="add"
                iconColor={off}
                label={t('feed.newTimeline')}
                role="button"
                onPress={() => {
                  onClose()
                  ui$.timelineModal.set({ profileKey: profile.key })
                }}
              />
            </>
          ) : (
            intervals.map((option) => {
              const checked = profile.checkIntervalMinutes === option.minutes
              return (
                <Row
                  key={option.label}
                  icon={checked ? 'radio-button-checked' : 'radio-button-unchecked'}
                  iconColor={checked ? on : off}
                  label={option.label}
                  checked={checked}
                  role="radio"
                  onPress={() => {
                    watch$.setProfileCheckInterval(profile.key, option.minutes)
                    onClose()
                  }}
                />
              )
            })
          )}
        </ScrollView>
        <View className="mt-4 flex-row justify-end">
          <NouButton size="1" variant="outline" onPress={onClose}>
            {t('buttons.done')}
          </NouButton>
        </View>
      </View>
    </BaseCenterModal>
  )
}
