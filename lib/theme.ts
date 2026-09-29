import { observable } from '@legendapp/state'
import { useValue } from '@legendapp/state/react'
import { Appearance, useColorScheme } from 'react-native'
import { twColors, type DynamicPalette, type TwColor } from './tw-colors'

// The wallpaper palette when dynamic color is on, otherwise null and the static
// Tailwind colors apply. Classes pick it up through the --nou-* CSS variables
// (see tailwind.config.js); inline colors go through twColor/useTwColor.
export const dynamicPalette$ = observable<DynamicPalette | null>(null)

const scheme = (colorScheme: string | null | undefined) => (colorScheme === 'light' ? 'light' : 'dark')

const namesByHex = Object.fromEntries(Object.entries(twColors).map(([name, hex]) => [hex, name])) as Record<
  string,
  TwColor
>

// Accepts a Tailwind color name or its hex value; any other color is returned as is.
const resolve = (palette: DynamicPalette | null, colorScheme: string | null | undefined, color: TwColor | string) => {
  const name = color in twColors ? (color as TwColor) : namesByHex[color.toLowerCase()]
  if (!name) {
    return color
  }
  return palette?.[scheme(colorScheme)][name] ?? twColors[name]
}

export const twColor = (color: TwColor | string) =>
  resolve(dynamicPalette$.peek(), Appearance.getColorScheme(), color)

export const useTwColor = () => {
  const palette = useValue(dynamicPalette$)
  const colorScheme = useColorScheme()
  return (color: TwColor | string) => resolve(palette, colorScheme, color)
}
