import { createElement } from 'react'
import { toast } from 'react-hot-toast'

export function showToast(msg: string) {
  toast(msg, {
    icon: '🐈‍⬛',
  })
}

/** A toast to click, for something to do about what it tells; it stays long enough for that. */
export function showActionToast(msg: string, onPress: () => void) {
  toast(
    (shown) =>
      createElement(
        'span',
        {
          role: 'button',
          style: { cursor: 'pointer' },
          onClick: () => {
            toast.dismiss(shown.id)
            onPress()
          },
        },
        msg,
      ),
    { icon: '🐈‍⬛', duration: 8000 },
  )
}
