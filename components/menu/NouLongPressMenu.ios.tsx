import { MenuView, type MenuAction } from '@expo/ui/community/menu'
import type { ReactNode } from 'react'
import type { Item } from './NouMenu'

export const NouLongPressMenu = ({ children, items }: { children: ReactNode; items: Item[] }) => {
  const actionableItems = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.kind !== 'separator' && item.kind !== 'label')
  const actions: MenuAction[] = actionableItems.map(({ item, index }) => ({
    id: String(index),
    title: item.label,
    attributes: item.disabled ? { disabled: true } : undefined,
  }))

  return (
    <MenuView
      actions={actions}
      shouldOpenOnLongPress
      onPressAction={({ nativeEvent }) => {
        const entry = actionableItems.find(({ index }) => String(index) === nativeEvent.event)
        entry?.item.handler()
      }}
    >
      {children}
    </MenuView>
  )
}
