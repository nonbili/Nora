import { ToastAndroid } from 'react-native'

export { showActionToast } from './action-toast'

export function showToast(msg: string) {
  ToastAndroid.show(msg, ToastAndroid.SHORT)
}
