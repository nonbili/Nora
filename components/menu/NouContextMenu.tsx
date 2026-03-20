import { ContextMenu } from '@radix-ui/themes'
import { ReactNode } from 'react'

export interface ContextItem {
  label: string
  handler: () => void
  icon?: ReactNode
  color?: 'red' | 'gray'
}

export const NouContextMenu: React.FC<{ children: ReactNode; items: ContextItem[] }> = ({ children, items }) => {
  const menuItems = items.map((item, index) => (
    <ContextMenu.Item key={index} onClick={item.handler} color={item.color} className="flex-row items-center gap-2">
      {item.icon}
      {item.label}
    </ContextMenu.Item>
  ))

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger>{children}</ContextMenu.Trigger>
      <ContextMenu.Content variant="soft">{menuItems}</ContextMenu.Content>
    </ContextMenu.Root>
  )
}
