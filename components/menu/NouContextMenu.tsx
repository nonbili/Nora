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
        className="flex-row items-center gap-2 min-w-[140px]"
      >
        {item.icon}
        <div className="flex-1">{item.label}</div>
        {item.meta}
      </ContextMenu.Item>
    )
  })

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>{children}</ContextMenu.Trigger>
      <ContextMenu.Content variant="soft" className="border border-zinc-300/70 dark:border-zinc-800/80">
        {menuItems}
      </ContextMenu.Content>
    </ContextMenu.Root>
  )
}
