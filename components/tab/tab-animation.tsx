import { View } from 'react-native'

export function useTabAnimation({
  headerHeight,
  headerShown,
  hideableHeader,
  headerPosition,
}: {
  headerHeight: number
  headerShown: boolean
  hideableHeader: boolean
  headerPosition: 'top' | 'bottom'
}) {
  return {
    Root: View,
    style: null,
  }
}
