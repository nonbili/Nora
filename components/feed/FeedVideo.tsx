/* Expo VideoPlayer is an imperative native object; its properties are writable. */
/* eslint-disable react-hooks/immutability */
import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { useVideoPlayer, VideoView } from 'expo-video'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { settings$ } from '@/states/settings'
import { normalizeVideoSpeed, videoLongPressSpeeds } from '@/lib/video-speed'
import { isWeb } from '@/lib/utils'
import { NouText } from '../NouText'
import { ZoomableMedia } from './ZoomableMedia'
import { ZoomedVideoControls } from './ZoomedVideoControls'

export function FeedVideo({ uri, headers, width, height, onError, onZoomChange }: {
  uri: string
  headers?: Record<string, string>
  width: number
  height: number
  onError: () => void
  onZoomChange?: (zoomed: boolean) => void
}) {
  const defaultSpeed = normalizeVideoSpeed(useValue(settings$.videoDefaultSpeed))
  const edgeEnabled = useValue(settings$.videoEdgeLongPressTo2x)
  const [heldSpeed, setHeldSpeed] = useState<number | null>(null)
  const [displayOptions, setDisplayOptions] = useState<number[]>([])
  const restingSpeed = useRef(defaultSpeed)
  const options = useRef(videoLongPressSpeeds)
  const anchor = useRef({ x: 0, index: 0 })
  const player = useVideoPlayer(headers ? { uri, headers } : uri, (p) => {
    p.loop = true
    p.playbackRate = defaultSpeed
    p.play()
  })
  const holding = useRef(false)
  useEffect(() => {
    // A changed preference also becomes the rate restored when a hold ends.
    restingSpeed.current = defaultSpeed
    if (!holding.current) player.playbackRate = defaultSpeed
  }, [player, defaultSpeed])
  useEffect(() => {
    const subscription = player.addListener('statusChange', ({ status }) => {
      if (status === 'error') onError()
    })
    return () => subscription.remove()
  }, [player, onError])
  // The web player needs its view mounted before it starts.
  useEffect(() => {
    if (isWeb) player.play()
  }, [player])

  const release = () => {
    if (holding.current) player.playbackRate = restingSpeed.current
    holding.current = false
    setHeldSpeed(null)
  }
  useEffect(() => {
    if (!edgeEnabled) release()
    // The gesture's finalize callback restores speed on cancellation and release.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edgeEnabled])

  const edgeGesture = Gesture.Pan().runOnJS(true)
    .enabled(edgeEnabled).maxPointers(1).activateAfterLongPress(300)
    .onTouchesDown((event, manager) => {
      const touch = event.allTouches[0]
      const edge = width * 0.28
      // One recognizer covers both edges. Native taps pass through to the player;
      // multi-touch and the player's control bars never activate the speed hold.
      if (event.allTouches.length !== 1 || !touch || touch.y < 80 || touch.y > height - 112 || (touch.x > edge && touch.x < width - edge)) {
        manager.fail()
      }
    })
    .onStart((event) => {
      if (!player.playing || holding.current) return
      restingSpeed.current = player.playbackRate
      options.current = videoLongPressSpeeds.filter((speed) => speed !== restingSpeed.current)
      setDisplayOptions(options.current)
      const speed = restingSpeed.current === 2 ? 3 : 2
      anchor.current = { x: event.translationX, index: options.current.indexOf(speed) }
      holding.current = true
      player.playbackRate = speed
      setHeldSpeed(speed)
    })
    .onUpdate((event) => {
      if (!holding.current) return
      const pos = anchor.current.index + (event.translationX - anchor.current.x) / 48
      const clamped = Math.max(0, Math.min(options.current.length - 1, pos))
      if (clamped !== pos) anchor.current.x = event.translationX - (clamped - anchor.current.index) * 48
      const speed = options.current[Math.round(clamped)]
      player.playbackRate = speed
      setHeldSpeed(speed)
    })
    .onFinalize(release)

  return (
    <GestureDetector gesture={edgeGesture} enableContextMenu userSelect="auto" touchAction="pan-x">
      <View style={{ width, height }}>
        <ZoomableMedia
          style={{ width, height }}
          onZoomChange={onZoomChange}
          overlay={(zoomed, reset) => zoomed ? <ZoomedVideoControls player={player} onReset={reset} /> : null}
        >
          {(zoomed) => <VideoView player={player} style={{ width, height }} contentFit="contain" nativeControls={!zoomed} surfaceType="textureView" />}
        </ZoomableMedia>
        {heldSpeed !== null ? (
          <View pointerEvents="none" className="absolute left-0 right-0 top-24 flex-row justify-center gap-1">
            {displayOptions.map((speed) => (
              <View key={speed} className={speed === heldSpeed ? 'rounded-full bg-black/80 px-3 py-2' : 'rounded-full bg-black/30 px-3 py-2'}>
                <NouText className="text-white">{speed}x</NouText>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </GestureDetector>
  )
}
