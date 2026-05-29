import { Alert } from 'react-native'
import { t } from 'i18next'
import { isWeb } from '@/lib/utils'

export const confirmDestructiveAction = (
  title: string,
  message: string,
  confirmText: string,
  action: () => void,
) => {
  if (isWeb) {
    if (window.confirm(message)) {
      action()
    }
    return
  }

  Alert.alert(title, message, [
    { text: t('buttons.cancel'), style: 'cancel' },
    {
      text: confirmText,
      style: 'destructive',
      onPress: action,
    },
  ])
}
