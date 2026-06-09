import type { CSSProperties } from 'react'
import { t } from 'i18next'
import type { TabGroupLayout } from '@/states/tab-groups'
import type { Tab } from '@/states/tabs'

export const SLOT_GAP = 8

export const getHiddenTabStyle = (): CSSProperties => ({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  opacity: 0,
  pointerEvents: 'none',
})

export const getTabLabel = (tab?: Pick<Tab, 'title' | 'url'> | null) => tab?.title || tab?.url || t('tabs.new')

export const getSlotStyle = (layout: Exclude<TabGroupLayout, 'deck'>, slotIndex: number): CSSProperties => {
  const half = `calc((100% - ${SLOT_GAP}px) / 2)`
  if (layout === 'split-view') {
    return {
      position: 'absolute',
      top: 0,
      left: slotIndex === 0 ? 0 : `calc(${half} + ${SLOT_GAP}px)`,
      width: half,
      height: '100%',
    }
  }

  const row = Math.floor(slotIndex / 2)
  const column = slotIndex % 2
  return {
    position: 'absolute',
    top: row === 0 ? 0 : `calc(${half} + ${SLOT_GAP}px)`,
    left: column === 0 ? 0 : `calc(${half} + ${SLOT_GAP}px)`,
    width: half,
    height: half,
  }
}

export const getLayoutLabel = (layout: TabGroupLayout) => {
  if (layout === 'split-view') return t('views.desktop.layout.split')
  if (layout === 'grid-4') return t('views.desktop.layout.grid')
  return t('views.desktop.layout.deck')
}
