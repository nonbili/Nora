import { useValue } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'

export const HoverLinkBar: React.FC = () => {
  const url = useValue(ui$.hoverLinkUrl)
  if (!url) return null
  return (
    <div className="pointer-events-none fixed bottom-0 left-0 z-50 max-w-[60vw] truncate rounded-tr-md border-t border-r border-zinc-300 bg-zinc-50 px-2 py-0.5 text-xs text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
      {url}
    </div>
  )
}
