import { colors } from '@/lib/colors'
import AntDesign from '@react-native-vector-icons/ant-design'
import MaterialCommunityIcons from '@react-native-vector-icons/material-design-icons'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { type ComponentProps, type ElementType } from 'react'
import { Pressable, useColorScheme } from 'react-native'

type IconButtonProps<T extends ElementType> = Omit<ComponentProps<T>, 'style' | 'onPress'> & Omit<ComponentProps<typeof Pressable>, 'children'>

const buttonStyle = { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' } as const

export const AntButton = ({ color, name, size = 24, style, ...props }: IconButtonProps<typeof AntDesign>) => {
  const colorScheme = useColorScheme()
  const isDark = colorScheme !== 'light'
  return (
    <Pressable {...props} style={(state) => [buttonStyle, typeof style === 'function' ? style(state) : style]}>
      <AntDesign name={name} size={size} color={color ?? (isDark ? colors.icon : colors.iconLightStrong)} />
    </Pressable>
  )
}

export const MaterialButton = ({ color, name, size = 24, style, ...props }: IconButtonProps<typeof MaterialIcons>) => {
  const colorScheme = useColorScheme()
  const isDark = colorScheme !== 'light'
  return (
    <Pressable {...props} style={(state) => [buttonStyle, typeof style === 'function' ? style(state) : style]}>
      <MaterialIcons name={name} size={size} color={color ?? (isDark ? colors.icon : colors.iconLightStrong)} />
    </Pressable>
  )
}

export const MaterialCommunityButton = ({ color, name, size = 24, style, ...props }: IconButtonProps<typeof MaterialCommunityIcons>) => {
  const colorScheme = useColorScheme()
  const isDark = colorScheme !== 'light'
  return (
    <Pressable {...props} style={(state) => [buttonStyle, typeof style === 'function' ? style(state) : style]}>
      <MaterialCommunityIcons name={name} size={size} color={color ?? (isDark ? colors.icon : colors.iconLightStrong)} />
    </Pressable>
  )
}
