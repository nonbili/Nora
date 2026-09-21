import { useValue } from '@legendapp/state/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { imagePreview$ } from '../lib/image-preview'
import './ImagePreview.css'

function PreviewIcon({ name }: { name: 'image' | 'close' | 'minus' | 'plus' | 'fit' }) {
  const paths = {
    image: 'M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM3 16l5-5 5 5 3-3 5 5M8 7h.01',
    close: 'm6 6 12 12M6 18 18 6',
    minus: 'M5 12h14',
    plus: 'M5 12h14M12 5v14',
    fit: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  }
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>
}

const clampZoom = (zoom: number) => Math.min(8, Math.max(0.05, zoom))

function ImagePreviewDialog({ dataUrl, error }: { dataUrl: string | null; error: boolean }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [natural, setNatural] = useState({ width: 0, height: 0 })
  const [viewport, setViewport] = useState({ width: 0, height: 0 })
  const [zoom, setZoom] = useState<number | null>(null)
  const [loadError, setLoadError] = useState(false)
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const fit = natural.width && viewport.width
    ? Math.min(1, viewport.width / natural.width, viewport.height / natural.height)
    : 1
  const scale = zoom ?? fit
  const scaleRef = useRef(scale)
  scaleRef.current = scale
  const width = natural.width * scale
  const height = natural.height * scale
  const previousSize = useRef({ width: 0, height: 0 })
  const close = () => imagePreview$.set(null)

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null
    const dialog = dialogRef.current!
    dialog.showModal()
    const viewportElement = viewportRef.current!
    const observer = new ResizeObserver(() => {
      setViewport({ width: viewportElement.clientWidth, height: viewportElement.clientHeight })
    })
    observer.observe(viewportElement)
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return
      event.preventDefault()
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 200 : 1)
      setZoom(clampZoom(scaleRef.current * Math.exp(-delta * 0.002)))
    }
    viewportElement.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      observer.disconnect()
      viewportElement.removeEventListener('wheel', onWheel)
      dialog.close()
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [])

  // Keep the viewed image centre stable when zooming, including the transition
  // from a centred, fitted image to an image larger than the viewport.
  useLayoutEffect(() => {
    const element = viewportRef.current!
    const previous = previousSize.current
    const centerX = previous.width ? (element.scrollLeft + viewport.width / 2 - Math.max(0, (viewport.width - previous.width) / 2)) / previous.width : 0.5
    const centerY = previous.height ? (element.scrollTop + viewport.height / 2 - Math.max(0, (viewport.height - previous.height) / 2)) / previous.height : 0.5
    element.scrollLeft = centerX * width - viewport.width / 2
    element.scrollTop = centerY * height - viewport.height / 2
    previousSize.current = { width, height }
  }, [width, height, viewport.width, viewport.height])

  const ready = Boolean(natural.width) && !error && !loadError
  return createPortal(
    <dialog
      ref={dialogRef}
      className="image-preview"
      aria-label="Image viewer"
      onCancel={(event) => { event.preventDefault(); close() }}
      onKeyDown={(event) => {
        // Keep browser tab shortcuts from acting on the page behind the dialog.
        event.stopPropagation()
        if (event.key === '+' || event.key === '=') {
          event.preventDefault()
          setZoom(clampZoom(scale * 1.25))
        } else if (event.key === '-') {
          event.preventDefault()
          setZoom(clampZoom(scale / 1.25))
        } else if (event.key === '0') {
          event.preventDefault()
          setZoom(null)
        }
      }}
    >
      <header className="image-preview-header">
        <div className="image-preview-heading">
          <span className="image-preview-mark"><PreviewIcon name="image" /></span>
          <div>
            <h1>Image preview</h1>
          </div>
        </div>
        <div className="image-preview-toolbar" role="group" aria-label="Image zoom controls">
          <button className="image-preview-icon-button" disabled={!ready || scale <= 0.05} aria-label="Zoom out" title="Zoom out (−)" onClick={() => setZoom(clampZoom(scale / 1.25))}><PreviewIcon name="minus" /></button>
          <output aria-label="Zoom level">{ready ? `${Math.round(scale * 100)}%` : '—'}</output>
          <button className="image-preview-icon-button" disabled={!ready || scale >= 8} aria-label="Zoom in" title="Zoom in (+)" onClick={() => setZoom(clampZoom(scale * 1.25))}><PreviewIcon name="plus" /></button>
          <span className="image-preview-divider" />
          <button disabled={!ready} aria-pressed={zoom === null} title="Fit image (0)" onClick={() => setZoom(null)}><PreviewIcon name="fit" />Fit</button>
          <button disabled={!ready} aria-pressed={zoom === 1} title="Actual size" onClick={() => setZoom(1)}>100%</button>
        </div>
        <button className="image-preview-close" autoFocus aria-label="Close image viewer" title="Close (Esc)" onClick={close}><PreviewIcon name="close" /></button>
      </header>
      <div
        ref={viewportRef}
        className="image-preview-viewport"
        style={{ cursor: width > viewport.width || height > viewport.height ? 'grab' : 'default' }}
        onPointerDown={(event) => {
          if (event.button !== 0 || !ready) return
          const element = event.currentTarget
          if (width <= element.clientWidth && height <= element.clientHeight) return
          drag.current = { x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop }
          element.setPointerCapture(event.pointerId)
          element.style.cursor = 'grabbing'
          event.preventDefault()
        }}
        onPointerMove={(event) => {
          if (!drag.current) return
          event.currentTarget.scrollLeft = drag.current.left - event.clientX + drag.current.x
          event.currentTarget.scrollTop = drag.current.top - event.clientY + drag.current.y
        }}
        onPointerUp={(event) => {
          drag.current = null
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
          event.currentTarget.style.cursor = width > viewport.width || height > viewport.height ? 'grab' : 'default'
        }}
        onLostPointerCapture={(event) => { drag.current = null; event.currentTarget.style.cursor = width > viewport.width || height > viewport.height ? 'grab' : 'default' }}
        onDoubleClick={() => setZoom(zoom === null ? 1 : null)}
      >
        <div className="image-preview-canvas" style={{ width: Math.max(viewport.width, width), height: Math.max(viewport.height, height) }}>
          {error || loadError ? <p role="alert">Could not load this image. Close the viewer and try again.</p> : !dataUrl ? <p role="status">Loading image…</p> : (
            <img
              src={dataUrl}
              alt="Image preview"
              draggable={false}
              style={{ width: natural.width ? width : undefined, height: natural.height ? height : undefined, visibility: natural.width ? 'visible' : 'hidden' }}
              onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
              onError={() => setLoadError(true)}
            />
          )}
        </div>
      </div>
    </dialog>,
    document.body,
  )
}

export function ImagePreview() {
  const preview = useValue(imagePreview$)
  return preview ? <ImagePreviewDialog key={preview.id} dataUrl={preview.dataUrl} error={preview.error} /> : null
}
