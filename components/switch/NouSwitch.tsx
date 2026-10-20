import { Platform, Pressable, Switch, View } from 'react-native'
import { NouText } from '../NouText'
import { clsx } from '@/lib/utils'
import { ReactNode } from 'react'
import { useTwColor } from '@/lib/theme'

export const NouSwitch: React.FC<{
  className?: string
  label: string | ReactNode
  value: boolean
  disabled?: boolean
  onPress: () => void
}> = ({ className, label, value, disabled = false, onPress }) => {
  const tw = useTwColor()
  const labelView = typeof label === 'string' ? <NouText className="font-medium">{label}</NouText> : label
  const control = (
    <Switch
      value={value}
      disabled={disabled}
      onValueChange={onPress}
      trackColor={{ false: tw('#a1a1aa'), true: tw('#6366f1') }}
      accessible={Platform.OS === 'ios' ? false : undefined}
      {...Platform.select({
        web: { activeThumbColor: '#ffffff' },
        android: { thumbColor: '#ffffff' },
      })}
    />
  )
  const rowClassName = clsx('items-center flex-row justify-between', disabled && 'opacity-50', className)

  if (Platform.OS === 'ios') {
    return (
      <Pressable
        className={rowClassName}
        style={{ minHeight: 44 }}
        disabled={disabled}
        onPress={onPress}
        accessibilityRole="switch"
        accessibilityState={{ checked: value, disabled }}
        accessibilityLabel={typeof label === 'string' ? label : undefined}
      >
        <View className="flex-1 pr-3">{labelView}</View>
        {control}
      </Pressable>
    )
  }

  return (
    <View className={rowClassName}>
      <Pressable className="flex-1" disabled={disabled} onPress={onPress}>{labelView}</Pressable>
      {control}
    </View>
  )
}
