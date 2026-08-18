import { DropdownMenu } from '@radix-ui/themes'
import { forwardRef, ReactNode, useImperativeHandle } from 'react'
import { clsx } from '@/lib/utils'

export interface Item {
  label: string
  handler: () => void
  icon?: ReactNode
  systemImage?: string
  disabled?: boolean
  description?: string
  kind?: 'item' | 'label' | 'separator'
  meta?: ReactNode
  metaLabel?: string
  trailing?: ReactNode
}

export interface NouMenuHandle {
  openAt: (x: number, y: number, items?: Item[]) => void
}

export const NouMenu = forwardRef<NouMenuHandle, { trigger?: ReactNode; items: Item[]; triggerColor?: string; triggerSize?: number; hideTrigger?: boolean }>(function NouMenu({ trigger, items, triggerSize, hideTrigger }, ref) {
  useImperativeHandle(ref, () => ({ openAt: () => {} }), [])
  const menuItems = items.map((item, index) => {
    if (item.kind === 'separator') {
      return <DropdownMenu.Separator key={index} />
    }

    if (item.kind === 'label') {
      return (
        <DropdownMenu.Label
          key={index}
          className="px-3 py-2 text-xs font-medium uppercase tracking-wide text-zinc-600 dark:text-zinc-500"
        >
          {item.label}
        </DropdownMenu.Label>
      )
    }

    return (
      <DropdownMenu.Item
        key={index}
        onClick={item.handler}
        disabled={item.disabled}
        className={clsx('min-w-[160px] max-w-[320px] px-3', item.description ? 'py-2 h-auto' : 'py-2')}
      >
        <div className="flex w-full min-w-0 flex-row items-center gap-3 leading-none">
          {item.icon ? <div className="flex shrink-0 items-center justify-center h-5 w-5">{item.icon}</div> : null}
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] leading-[18px] text-zinc-900 dark:text-zinc-100">{item.label}</div>
            {item.description ? (
              <div className="truncate text-[11px] leading-[12px] text-zinc-600 dark:text-zinc-500">
                {item.description}
              </div>
            ) : null}
          </div>
          {item.meta ? (
            <div className="shrink-0">{item.meta}</div>
          ) : item.metaLabel ? (
            <div className="shrink-0 text-xs text-zinc-600 dark:text-zinc-500">{item.metaLabel}</div>
          ) : null}
          {item.trailing ? <div className="shrink-0">{item.trailing}</div> : null}
        </div>
      </DropdownMenu.Item>
    )
  })

  if (hideTrigger) return null

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {/*
          Radix merges the trigger handlers onto this div, so it has to stay hit-testable.
          The pointer-events-none belongs on the inner wrapper instead: triggers are often
          a Pressable (MaterialButton), which would otherwise swallow the click before the
          menu ever sees it. Mirrors the pointerEvents="none" the native menus use.
        */}
        <div
          className="flex shrink min-w-0 items-center justify-center"
          style={triggerSize ? { minWidth: triggerSize, minHeight: triggerSize } : undefined}
        >
          <div className="pointer-events-none flex min-w-0 items-center justify-center">{trigger}</div>
        </div>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        variant="soft"
        className="max-h-[70vh] overflow-auto rounded-xl border border-zinc-300/70 dark:border-zinc-800/80 shadow-xl shadow-zinc-900/15 dark:shadow-black/40"
      >
        {menuItems}
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  )
})
