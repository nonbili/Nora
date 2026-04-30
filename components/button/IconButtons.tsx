import { colors } from '@/lib/colors'
import AntDesign from '@expo/vector-icons/AntDesign'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import { ComponentProps } from 'react'
import { useColorScheme } from 'react-native'

export const AntButton = ({ color, ...props }: ComponentProps<typeof AntDesign.Button>) => {
  const colorScheme = useColorScheme()
  const isDark = colorScheme !== 'light'
  return (
    <AntDesign.Button
      backgroundColor="transparent"
      underlayColor={isDark ? colors.underlay : '#e5e7eb'}
      iconStyle={{ marginRight: 0 }}
      style={{ padding: 10 }}
      size={24}
      {...props}
      color={color ?? (isDark ? colors.icon : colors.iconLightStrong)}
    />
  )
}

export const MaterialButton = ({ color, ...props }: ComponentProps<typeof MaterialIcons.Button>) => {
  const colorScheme = useColorScheme()
  const isDark = colorScheme !== 'light'
  return (
    <MaterialIcons.Button
      backgroundColor="transparent"
      underlayColor={isDark ? colors.underlay : '#e5e7eb'}
      iconStyle={{ marginRight: 0 }}
      style={{ padding: 10 }}
      size={24}
      {...props}
      color={color ?? (isDark ? colors.icon : colors.iconLightStrong)}
    />
  )
}
