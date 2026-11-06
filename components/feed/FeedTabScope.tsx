import { createContext, useContext, useState, type ReactNode } from 'react'
import { View } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { ui$ } from '@/states/ui'
import { feedOverlayKeys } from '@/lib/feed-overlays'

interface FeedTabScope {
  tabId: string
  width: number
  height: number
  container: HTMLElement | null
}

const Context = createContext<FeedTabScope | null>(null)

export const useFeedTabScope = () => useContext(Context)

/** Keeps desktop feed overlays within the content area, below the tab toolbar. */
export const FeedTabScope = ({ tabId, children, overlays }: { tabId: string; children: ReactNode; overlays: ReactNode }) => {
  const covered = useValue(() => feedOverlayKeys.some((key) => ui$[key].get()?.tabId === tabId))
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  return (
    <View
      ref={setContainer as any}
      className="relative flex-1 min-h-0 min-w-0 overflow-hidden"
      onLayout={({ nativeEvent: { layout } }) => setSize({ width: layout.width, height: layout.height })}
    >
      <Context.Provider value={{ tabId, container, ...size }}>
        <div className="flex flex-1 min-h-0 min-w-0 flex-col" inert={covered} aria-hidden={covered || undefined}>
          {children}
        </div>
        {overlays}
      </Context.Provider>
    </View>
  )
}
