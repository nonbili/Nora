import { observable } from '@legendapp/state'

type ImagePreviewState = { id: string; dataUrl: string | null; error: boolean }
export const imagePreview$ = observable<ImagePreviewState | null>(null)

export function showImagePreview(id: string) {
  imagePreview$.set({ id, dataUrl: null, error: false })
}

export function updateImagePreview(id: string, dataUrl: string | null) {
  if (imagePreview$.get()?.id !== id) return
  imagePreview$.set({ id, dataUrl, error: !dataUrl })
}
