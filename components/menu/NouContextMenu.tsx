import { ContextMenu } from '@radix-ui/themes'
import { ReactNode } from 'react'

export interface ContextItem {
  label?: string
  handler?: () => void
  icon?: ReactNode
  color?: 'red' | 'gray'
  kind?: 'item' | 'separator'
  meta?: ReactNode
}

export const NouContextMenu: React.FC<{ children: ReactNode; items: ContextItem[] }> = ({ children, items }) => {
  const menuItems = items.map((item, index) => {
    if (item.kind === 'separator') {
      return <ContextMenu.Separator key={index} />
    }

    return (
      <ContextMenu.Item
        key={index}
        onClick={item.handler}
        color={item.color}
        className="min-w-[160px] px-3 py-2"
      >
        <div className="flex flex-row items-center gap-3 leading-none">
          {item.icon ? <div className="flex shrink-0 items-center justify-center h-5 w-5">{item.icon}</div> : null}
          <div className="flex-1 truncate text-[13px] leading-[18px]">{item.label}</div>
          {item.meta}
        </div>
      </ContextMenu.Item>
    )
  })

  return (
    <ContextMenu.Root modal={true}>
      <ContextMenu.Trigger>{children}</ContextMenu.Trigger>
      <ContextMenu.Content variant="soft" className="border border-zinc-300/70 dark:border-zinc-800/80 shadow-xl shadow-zinc-900/15 dark:shadow-black/40">
        {menuItems}
      </ContextMenu.Content>
    </ContextMenu.Root>
  )
}
