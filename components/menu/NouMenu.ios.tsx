import { Button, Divider, Host, Menu, Section } from '@expo/ui/swift-ui'
import { disabled, frame, tint } from '@expo/ui/swift-ui/modifiers'
import type { Item, NouMenuHandle } from './NouMenu'
import { forwardRef, Fragment, ReactNode, useImperativeHandle } from 'react'
import { View } from 'react-native'

export const NouMenu = forwardRef<NouMenuHandle, { trigger?: ReactNode; items: Item[]; triggerColor?: string; triggerSize?: number; hideTrigger?: boolean }>(function NouMenu({ trigger, items, triggerColor, triggerSize = 44, hideTrigger }, ref) {
  useImperativeHandle(ref, () => ({ openAt: () => {} }), [])
  const groups = items.reduce<Item[][]>((acc, item) => {
    if (item.kind === 'separator') {
      acc.push([])
      return acc
    }

    const current = acc[acc.length - 1]
    current.push(item)
    return acc
  }, [[]]).filter((group) => group.length)

  const menuItems = groups.map((group, groupIndex) => {
    const header = group.find((item) => item.kind === 'label')
    const buttons = group
      .filter((item) => item.kind !== 'label')
      .map((item, itemIndex) => (
        <Button
          key={`${groupIndex}-${itemIndex}`}
          label={item.metaLabel ? `${item.label} (${item.metaLabel})` : item.label}
          modifiers={item.disabled ? [disabled(true)] : undefined}
          onPress={item.handler}
          systemImage={item.systemImage as any}
        />
      ))

    const content = header ? (
      <Section key={`section-${groupIndex}`} title={header.label}>
        {buttons}
      </Section>
    ) : (
      buttons
    )

    return (
      <Fragment key={`group-${groupIndex}`}>
        {groupIndex > 0 ? <Divider key={`divider-${groupIndex}`} /> : null}
        {content}
      </Fragment>
    )
  })

  if (hideTrigger) return null

  return (
    <Host matchContents>
      <Menu
        label={typeof trigger === 'string' ? '' : <View pointerEvents="none">{trigger}</View>}
        systemImage={typeof trigger === 'string' ? (trigger as any) : undefined}
        modifiers={typeof trigger === 'string' ? [frame({ width: triggerSize, height: triggerSize }), ...(triggerColor ? [tint(triggerColor)] : [])] : undefined}
      >
        {menuItems}
      </Menu>
    </Host>
  )
})
