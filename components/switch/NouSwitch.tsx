import { Platform, Pressable, Switch, View } from 'react-native'
import { NouText } from '../NouText'
import { clsx } from '@/lib/utils'
import { ReactNode } from 'react'

export const NouSwitch: React.FC<{
  className?: string
  label: string | ReactNode
  value: boolean
  onPress: () => void
}> = ({ className, label, value, onPress }) => {
  return (
    <View className={clsx('items-center flex-row justify-between', className)}>
      <Pressable className="flex-1" onPress={onPress}>
        {typeof label == 'string' ? <NouText className="font-medium">{label}</NouText> : label}
      </Pressable>
      <Switch
        value={value}
        onValueChange={(v) => onPress()}
        trackColor={{ false: '#767577', true: '#e9d5ff' }}
        thumbColor={value ? '#6366f1' : '#f4f3f4'}
        {...Platform.select({
          web: {
            activeThumbColor: '#6366f1',
          },
          ios: {
            style: { transform: [{ scale: 0.8 }] },
          },
        })}
      />
    </View>
  )
}
