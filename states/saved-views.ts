import { observable, type Observable } from '@legendapp/state'
import { syncObservable } from '@legendapp/state/sync'
import { ObservablePersistMMKV } from '@legendapp/state/persist-plugins/mmkv'
import { genId } from '@/lib/utils'

export const DECK_VIEW_ID = 'deck'

export type CustomSavedViewLayout = 'two-col' | 'grid-4'
export type SavedViewLayout = 'deck' | CustomSavedViewLayout

export interface CustomSavedView {
  id: string
  name: string
  layout: CustomSavedViewLayout
  slotTabIds: (string | null)[]
}

interface Store {
  activeViewId: string
  savedViews: CustomSavedView[]

  createSavedView: (layout: CustomSavedViewLayout, seedTabIds?: string[]) => string
  renameView: (viewId: string, name: string) => void
  deleteView: (viewId: string) => void
  setActiveView: (viewId: string) => void
  assignSlotTab: (viewId: string, slotIndex: number, tabId: string | null) => void
  appendSplitViewSlot: (viewId: string) => void
  removeSplitViewSlot: (viewId: string, slotIndex: number) => void
  cleanupClosedTabIds: (tabIds: string[]) => void
}

const savedViewSlotCounts: Record<CustomSavedViewLayout, number> = {
  'two-col': 2,
  'grid-4': 4,
}

const getSavedViewDefaultName = (layout: CustomSavedViewLayout, index: number) =>
  layout === 'two-col' ? `2-col ${index}` : `Grid ${index}`

const getSanitizedLayout = (layout?: string): CustomSavedViewLayout => (layout === 'grid-4' ? 'grid-4' : 'two-col')

const getSlotCount = (layout: CustomSavedViewLayout) => savedViewSlotCounts[layout]

const getInitialSeedTabIds = (layout: CustomSavedViewLayout, seedTabIds: string[]) => seedTabIds.slice(0, getSlotCount(layout))

const sanitizeSlotTabIds = (layout: CustomSavedViewLayout, slotTabIds?: (string | null)[]) => {
  const minimumCount = getSlotCount(layout)
  const sanitizedSource = layout === 'two-col' ? slotTabIds || [] : (slotTabIds || []).slice(0, minimumCount)
  const sanitized = sanitizedSource.map((tabId) => (typeof tabId === 'string' && tabId ? tabId : null))

  while (sanitized.length < minimumCount) {
    sanitized.push(null)
  }

  return sanitized
}

const normalizeSavedViews = <T extends Partial<Store> | undefined>(data: T) => {
  if (!data) {
    return data
  }

  const layoutCounts: Record<CustomSavedViewLayout, number> = {
    'two-col': 0,
    'grid-4': 0,
  }

  data.savedViews = (data.savedViews || [])
    .filter((view): view is CustomSavedView => view != null)
    .map((view) => {
      const layout = getSanitizedLayout(view.layout)
      layoutCounts[layout] += 1

      return {
        id: typeof view.id === 'string' && view.id ? view.id : genId(),
        name:
          typeof view.name === 'string' && view.name.trim()
            ? view.name.trim()
            : getSavedViewDefaultName(layout, layoutCounts[layout]),
        layout,
        slotTabIds: sanitizeSlotTabIds(layout, view.slotTabIds),
      }
    })

  const hasActiveCustomView =
    typeof data.activeViewId === 'string' && data.savedViews.some((view) => view.id === data.activeViewId)
  if (data.activeViewId !== DECK_VIEW_ID && !hasActiveCustomView) {
    data.activeViewId = DECK_VIEW_ID
  }

  return data
}

const findSavedViewIndex = (viewId: string) => savedViews$.savedViews.get().findIndex((view) => view?.id === viewId)

export const getSavedViewSlotCount = (layout: CustomSavedViewLayout) => getSlotCount(layout)

export const createDesktopSavedView = (layout: CustomSavedViewLayout, seedTabIds: string[] = []) => {
  const nextIndex = savedViews$.savedViews.get().filter((view) => view?.layout === layout).length + 1
  const view: CustomSavedView = {
    id: genId(),
    name: getSavedViewDefaultName(layout, nextIndex),
    layout,
    slotTabIds: sanitizeSlotTabIds(layout, getInitialSeedTabIds(layout, seedTabIds)),
  }

  savedViews$.savedViews.push(view)
  savedViews$.activeViewId.set(view.id)
  return view.id
}

export const savedViews$: Observable<Store> = observable<Store>({
  activeViewId: DECK_VIEW_ID,
  savedViews: [],

  createSavedView: (layout, seedTabIds = []) => createDesktopSavedView(layout, seedTabIds),

  renameView: (viewId, name) => {
    const nextName = name.trim()
    if (!nextName) {
      return
    }

    const index = findSavedViewIndex(viewId)
    if (index === -1) {
      return
    }

    savedViews$.savedViews[index].name.set(nextName)
  },

  deleteView: (viewId) => {
    const index = findSavedViewIndex(viewId)
    if (index === -1) {
      return
    }

    savedViews$.savedViews.splice(index, 1)
    if (savedViews$.activeViewId.get() === viewId) {
      savedViews$.activeViewId.set(DECK_VIEW_ID)
    }
  },

  setActiveView: (viewId) => {
    if (viewId === DECK_VIEW_ID || findSavedViewIndex(viewId) !== -1) {
      savedViews$.activeViewId.set(viewId)
    }
  },

  assignSlotTab: (viewId, slotIndex, tabId) => {
    const index = findSavedViewIndex(viewId)
    if (index === -1) {
      return
    }

    const view$ = savedViews$.savedViews[index]
    const layout = view$.layout.get()
    const slotCount = view$.slotTabIds.get().length
    if (slotIndex < 0 || slotIndex >= slotCount) {
      return
    }

    if (tabId) {
      const currentSlots = view$.slotTabIds.get()
      if (currentSlots.some((currentTabId, currentIndex) => currentIndex !== slotIndex && currentTabId === tabId)) {
        return
      }
      view$.slotTabIds[slotIndex].set(tabId)
      return
    }

    view$.slotTabIds[slotIndex].set(null)
  },

  appendSplitViewSlot: (viewId) => {
    const index = findSavedViewIndex(viewId)
    if (index === -1) {
      return
    }

    const view$ = savedViews$.savedViews[index]
    if (view$.layout.get() !== 'two-col') {
      return
    }

    view$.slotTabIds.push(null)
  },

  removeSplitViewSlot: (viewId, slotIndex) => {
    const index = findSavedViewIndex(viewId)
    if (index === -1) {
      return
    }

    const view$ = savedViews$.savedViews[index]
    if (view$.layout.get() !== 'two-col') {
      return
    }

    const slotCount = view$.slotTabIds.get().length
    if (slotCount <= getSlotCount('two-col') || slotIndex < getSlotCount('two-col') || slotIndex >= slotCount) {
      return
    }

    view$.slotTabIds.splice(slotIndex, 1)
  },

  cleanupClosedTabIds: (tabIds) => {
    if (!tabIds.length) {
      return
    }

    const closedTabIdSet = new Set(tabIds)
    for (const savedView$ of savedViews$.savedViews) {
      const layout = savedView$.layout.get()
      const slotTabIds = savedView$.slotTabIds.get()
      const hasClosedAssignedTab = slotTabIds.some((tabId) => tabId && closedTabIdSet.has(tabId))
      if (!hasClosedAssignedTab) {
        continue
      }

      const nextSlotTabIds =
        layout === 'two-col'
          ? sanitizeSlotTabIds(
              layout,
              slotTabIds.filter((tabId): tabId is string => typeof tabId === 'string' && !closedTabIdSet.has(tabId)),
            )
          : slotTabIds.map((tabId) => (tabId && closedTabIdSet.has(tabId) ? null : tabId))
      const changed =
        nextSlotTabIds.length !== slotTabIds.length || nextSlotTabIds.some((tabId, index) => tabId !== slotTabIds[index])
      if (changed) {
        savedView$.slotTabIds.set(nextSlotTabIds)
      }
    }
  },
})

syncObservable(savedViews$, {
  persist: {
    name: 'desktop-saved-views',
    plugin: ObservablePersistMMKV,
    transform: {
      load: (data: Store) => normalizeSavedViews(data),
    },
  },
})
