import { createElement } from 'react'
import { toast } from 'react-hot-toast'

export function showToast(msg: string) {
  toast(msg, {
    icon: '🐈‍⬛',
  })
}

/** A toast with a button, for something to do about what it tells; it stays long enough for that. */
export function showButtonToast(msg: string, label: string, onPress: () => void) {
  toast(
    (shown) =>
      createElement(
        'span',
        { className: 'flex items-center gap-3' },
        createElement('span', { className: 'break-all' }, msg),
        createElement(
          'button',
          {
            className: 'shrink-0 rounded bg-zinc-200 px-2 py-1 text-sm hover:bg-zinc-300',
            onClick: () => {
              toast.dismiss(shown.id)
              onPress()
            },
          },
          label,
        ),
      ),
    { icon: '🐈‍⬛', duration: 8000 },
  )
}

/** A toast to click, for something to do about what it tells; it stays long enough for that. */
export function showActionToast(msg: string, onPress: () => void, label?: string) {
  if (label) return showButtonToast(msg, label, onPress)
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
