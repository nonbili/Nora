import { Platform } from 'react-native'
import { StorageAccessFramework } from 'expo-file-system/legacy'

// The picked tree URI comes with a persisted read and write grant, so it survives restarts.
export const pickDirectory = async (initialUri: string | null): Promise<string | null> => {
  if (Platform.OS !== 'android') return null
  const result = await StorageAccessFramework.requestDirectoryPermissionsAsync(initialUri)
  return result.granted ? result.directoryUri : null
}
