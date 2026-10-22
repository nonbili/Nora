export * from 'react-native-web'

// expo-symbols imports this for its Android default color. Its web branch uses
// a regular CSS color and never calls this native-only API.
export function PlatformColor() {
  throw new Error('PlatformColor is unavailable on desktop')
}
