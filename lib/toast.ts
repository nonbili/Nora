import { toast } from 'react-hot-toast'

export function showToast(msg: string) {
  toast(msg, {
    icon: '🐈‍⬛',
  })
}
