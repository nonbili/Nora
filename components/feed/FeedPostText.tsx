import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react'
import { Pressable, View, type TextProps } from 'react-native'
import { t } from 'i18next'
import { isWeb, iosTouchTarget } from '@/lib/utils'
import { NouText } from '../NouText'

/** Keep selection separate from the control that expands long posts. */
export function FeedPostText({ children, style, lines = 8 }: {
  children: string
  style: TextProps['style']
  lines?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const containerRef = useRef<ComponentRef<typeof View>>(null)
  // React Native Web does not emit onTextLayout; measure its clamped text instead.
  const measure = useCallback(() => {
    if (!isWeb || expanded) return
    const container = containerRef.current as unknown as HTMLElement | null
    const element = container?.firstElementChild
    if (element) setHasMore(element.scrollHeight > element.clientHeight)
  }, [expanded])
  useEffect(measure, [measure, children, lines])
  return (
    <View ref={containerRef}>
      <NouText
        selectable
        className="mt-1"
        style={style}
        numberOfLines={expanded ? undefined : lines}
        onLayout={measure}
      >
        {children}
      </NouText>
      {!isWeb ? (
        // Measure the full text: a clamped native layout can report exactly the line limit
        // both when text fits and when it has been truncated.
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ position: 'absolute', left: 0, right: 0, opacity: 0 }}
        >
          <NouText
            accessible={false}
            style={style}
            onTextLayout={(event) => setHasMore(event.nativeEvent.lines.length > lines)}
          >
            {children}
          </NouText>
        </View>
      ) : null}
      {hasMore ? (
        <Pressable
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          style={iosTouchTarget}
          className="self-start justify-center py-1"
        >
          <NouText className="text-sm text-indigo-600 dark:text-indigo-400">{t(expanded ? 'feed.showLess' : 'feed.showMore')}</NouText>
        </Pressable>
      ) : null}
    </View>
  )
}
