import { type ComponentRef, useEffect, useRef } from 'react'
import type { View } from 'react-native'
import { isWeb } from '@/lib/utils'

/** Let an inner scroller consume its wheel before panning the enclosing media. */
function childCanScroll(root: HTMLElement, target: EventTarget | null, dx: number, dy: number) {
  const horizontal = Math.abs(dx) >= Math.abs(dy)
  const delta = horizontal ? dx : dy
  if (!delta) return false
  let child = target as HTMLElement | null
  while (child && child !== root) {
    if (child.nodeType === 1) {
      const style = child.ownerDocument.defaultView?.getComputedStyle(child)
      const overflow = horizontal ? style?.overflowX : style?.overflowY
      const max = horizontal ? child.scrollWidth - child.clientWidth : child.scrollHeight - child.clientHeight
      const offset = horizontal ? child.scrollLeft : child.scrollTop
      const rtl = horizontal && style?.direction === 'rtl'
      const canMove = rtl
        ? delta > 0 ? offset < -1 : offset > -max + 1
        : delta > 0 ? offset < max - 1 : offset > 1
      if (max > 1 && /^(auto|scroll|overlay)$/.test(overflow || '') && canMove) return true
    }
    child = child.parentElement
  }
  return false
}

/** Chromium delivers mouse Ctrl+wheel and trackpad pinches as wheel events. */
export function useWheelZoom(
  onZoom: (factor: number, x: number, y: number) => void,
  enabled = true,
  onPan?: (dx: number, dy: number) => boolean,
) {
  const ref = useRef<ComponentRef<typeof View>>(null)
  useEffect(() => {
    if (!isWeb || !enabled) return
    const element = ref.current as unknown as HTMLElement | null
    if (!element?.addEventListener) return
    const onWheel = (event: WheelEvent) => {
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 200 : 1
      if (!event.ctrlKey) {
        const dx = (event.shiftKey && !event.deltaX ? event.deltaY : event.deltaX) * unit
        const dy = event.shiftKey ? 0 : event.deltaY * unit
        if (childCanScroll(element, event.target, dx, dy)) return
        if (onPan?.(dx, dy)) {
          event.preventDefault()
          event.stopPropagation()
        }
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const rect = element.getBoundingClientRect()
      const delta = event.deltaY * unit
      onZoom(Math.exp(-delta * 0.002), event.clientX - rect.left, event.clientY - rect.top)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [onZoom, enabled, onPan])
  return ref
}
