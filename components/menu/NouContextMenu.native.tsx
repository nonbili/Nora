import type { ReactNode } from 'react'

export interface ContextItem {
  label?: string
  handler?: () => void
  icon?: ReactNode
  color?: 'red' | 'gray'
  kind?: 'item' | 'separator'
  meta?: ReactNode
  metaLabel?: string
  systemImage?: string
}

export const NouContextMenu = ({ children }: { children: ReactNode; items: ContextItem[] }) => {
  return <>{children}</>
}
