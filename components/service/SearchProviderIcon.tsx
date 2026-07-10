import { Image } from 'expo-image'
import MaterialIcons, { type MaterialIconsIconName } from '@react-native-vector-icons/material-icons'
import { View, useColorScheme } from 'react-native'
import { services } from './Services'
import { getFaviconUrl, ResolvedSearchProvider } from '@/lib/search'
import { colors } from '@/lib/colors'

const SearchIcon = ({ name, size, color }: { name: MaterialIconsIconName; size: number; color: string }) => (
  <MaterialIcons name={name} size={size} color={color} />
)

export const SearchProviderIcon: React.FC<{
  provider: Pick<ResolvedSearchProvider, 'id' | 'kind' | 'serviceId' | 'iconUrl'>
  size?: number
}> = ({ provider, size = 20 }) => {
  const colorScheme = useColorScheme()
  const isDark = colorScheme === 'dark'

  if (provider.kind === 'url') {
    return <SearchIcon name="language" size={size} color={isDark ? colors.iconMutedDark : colors.iconLight} />
  }

  const faviconUrl =
    provider.id === 'duckduckgo'
      ? getFaviconUrl('https://duckduckgo.com/?q=%s')
      : provider.id === 'google'
        ? getFaviconUrl('https://www.google.com/search?q=%s')
        : provider.kind === 'custom'
          ? provider.iconUrl
          : undefined

  if (faviconUrl) {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Image
          source={faviconUrl}
          style={{ width: size, height: size, borderRadius: size / 4 }}
          contentFit="contain"
        />
      </View>
    )
  }

  const serviceIcon = provider.serviceId ? services[provider.serviceId]?.[1]?.() : null
  if (serviceIcon) {
    return <View style={{ transform: [{ scale: size / 24 }] }}>{serviceIcon}</View>
  }

  return <SearchIcon name="search" size={size} color="#a1a1aa" />
}
