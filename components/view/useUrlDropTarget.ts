import type React from 'react'
import { useState } from 'react'
import { claimsHostDrop, readDraggedUrl } from '@/lib/drag-url'

// Shared wiring for the parts of the chrome that take a URL dragged in from a page. A row
// and a section sit inside the surface behind them, so each stops the drop from travelling
// on, which would otherwise also open a tab there.
export function useUrlDropTarget(onDropUrl: (url: string) => void, { stopPropagation = true } = {}) {
  const [isUrlOver, setIsUrlOver] = useState(false)

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!claimsHostDrop(e.dataTransfer)) {
      return
    }
    e.preventDefault()
    if (stopPropagation) {
      e.stopPropagation()
    }
    e.dataTransfer.dropEffect = 'copy'
    setIsUrlOver(true)
  }

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) {
      return
    }
    setIsUrlOver(false)
  }

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    if (stopPropagation) {
      e.stopPropagation()
    }
    setIsUrlOver(false)
    const url = readDraggedUrl(e.dataTransfer)
    if (url) {
      onDropUrl(url)
    }
  }

  return { isUrlOver, dropProps: { onDragOver, onDragLeave, onDrop } }
}
