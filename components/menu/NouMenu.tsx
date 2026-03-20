import { Button, DropdownMenu } from '@radix-ui/themes'
import { ReactNode } from 'react'

export interface Item {
  label: string
  handler: () => void
  icon?: ReactNode
}

export const NouMenu: React.FC<{ trigger: ReactNode; items: Item[] }> = ({ trigger, items }) => {
  const menuItems = items.map((item, index) => (
    <DropdownMenu.Item key={index} onClick={item.handler} className="flex-row items-center gap-2">
      {item.icon}
      {item.label}
    </DropdownMenu.Item>
  ))

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        <div className="flex shrink min-w-0 items-center justify-center">
          {trigger}
        </div>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content variant="soft">{menuItems}</DropdownMenu.Content>
    </DropdownMenu.Root>
  )
}
