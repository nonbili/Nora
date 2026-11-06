import { useValue } from '@legendapp/state/react'
import { feedOverlayBelongsTo } from '@/lib/feed-overlays'
import { tabs$ } from '@/states/tabs'
import { ui$ } from '@/states/ui'
import { isWeb } from '@/lib/utils'
import { AddSourcesModal } from '../modal/AddSourcesModal'
import { FeedSettingsModal } from '../modal/FeedSettingsModal'
import { SourcesModal } from '../modal/SourcesModal'
import { FeedGalleryModal } from '../modal/FeedGalleryModal'
import { TimelineModal } from '../modal/TimelineModal'
import { SourcePickerModal } from '../modal/SourcePickerModal'
import { SourcesScreen } from '../page/SourcesScreen'

const stopPropagation = (event: { stopPropagation: () => void }) => event.stopPropagation()

/** Desktop overlays belong to the tab that opened them; native keeps its sheets. */
export const FeedOverlays = ({ tabId }: { tabId?: string }) => {
  const addSources = useValue(ui$.addSourcesModal)
  const settings = useValue(ui$.feedSettingsModal)
  const sources = useValue(ui$.sourcesModal)
  const gallery = useValue(ui$.feedGallery)
  const timeline = useValue(ui$.timelineModal)
  const picker = useValue(ui$.sourcePicker)
  const screen = useValue(ui$.sourcesScreen)
  const owns = (target: { tabId?: string } | null) => feedOverlayBelongsTo(target, tabId, !isWeb)
  const content = (
    <>
      {isWeb && tabId && owns(screen) && <SourcesScreen />}
      {owns(addSources) && <AddSourcesModal />}
      {owns(settings) && <FeedSettingsModal />}
      {owns(sources) && <SourcesModal />}
      {owns(gallery) && <FeedGalleryModal />}
      {owns(timeline) && <TimelineModal />}
      {owns(picker) && <SourcePickerModal />}
    </>
  )
  // Overlays participate in tab layout, but their gestures and drops belong to their own controls.
  return isWeb ? (
    <div
      className="contents"
      onPointerDown={(event) => {
        if (tabId) tabs$.setActiveTabById(tabId, 'user')
        event.stopPropagation()
      }}
      onMouseDown={stopPropagation}
      onTouchStart={stopPropagation}
      onDragStart={stopPropagation}
      onDragOver={stopPropagation}
      onDrop={stopPropagation}
    >
      {content}
    </div>
  ) : content
}
