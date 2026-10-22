import { useValue } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { SourcesList } from '../feed/SourcesList'
import { BaseCenterModal } from './BaseCenterModal'

/** Quick selection of a source within a feed tab. */
export const SourcesModal = () => {
  const target = useValue(ui$.sourcesModal)
  if (!target) return null
  const onClose = () => ui$.sourcesModal.set(null)
  return (
    <BaseCenterModal onClose={onClose}>
      <SourcesList tabId={target.tabId} timelineId={target.timelineId} pick onClose={onClose} />
    </BaseCenterModal>
  )
}
