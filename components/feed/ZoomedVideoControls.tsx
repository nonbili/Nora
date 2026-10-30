/* Expo's player exposes mutable native playback properties. */
/* eslint-disable react-hooks/immutability */
import { useEffect, useState } from 'react'
import { Pressable, View } from 'react-native'
import type { VideoPlayer } from 'expo-video'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { t } from 'i18next'
import { NouText } from '../NouText'

/** The native controls scale with the video; keep these outside its zoom/pan area. */
export function ZoomedVideoControls({ player, onReset }: { player: VideoPlayer; onReset: () => void }) {
  const [playing, setPlaying] = useState(player.playing)
  const [time, setTime] = useState(player.currentTime)
  const [duration, setDuration] = useState(player.duration)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const timeListener = player.addListener('timeUpdate', ({ currentTime }) => {
      setTime(currentTime)
      setDuration(player.duration)
    })
    const playListener = player.addListener('playingChange', ({ isPlaying }) => setPlaying(isPlaying))
    player.timeUpdateEventInterval = 0.25
    return () => {
      player.timeUpdateEventInterval = 0
      timeListener.remove()
      playListener.remove()
    }
  }, [player])
  const seek = (x: number) => {
    if (!width || !Number.isFinite(duration) || duration <= 0) return
    const next = Math.max(0, Math.min(duration, x / width * duration))
    player.currentTime = next
    setTime(next)
  }
  const seekGesture = Gesture.Pan().runOnJS(true).minDistance(0)
    .onBegin((event) => seek(event.x))
    .onUpdate((event) => seek(event.x))
  return (
    <View className="absolute bottom-0 left-0 right-0 h-28 flex-row items-center gap-3 bg-black/80 px-4">
      <Pressable
        className="h-11 w-11 items-center justify-center"
        accessibilityRole="button"
        accessibilityLabel={t(playing ? 'feed.pauseVideo' : 'feed.playVideo')}
        onPress={() => playing ? player.pause() : player.play()}
      >
        <MaterialIcons name={playing ? 'pause' : 'play-arrow'} color="#fff" size={28} />
      </Pressable>
      <GestureDetector gesture={seekGesture}>
        <View
          className="h-11 flex-1 justify-center"
          onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
          accessibilityRole="adjustable"
          accessibilityLabel={t('feed.seekVideo')}
          accessibilityValue={{ min: 0, max: Number.isFinite(duration) ? duration : 0, now: time }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(event) => {
            player.currentTime = Math.max(0, Math.min(duration, player.currentTime + (event.nativeEvent.actionName === 'increment' ? 10 : -10)))
          }}
        >
          <View className="h-1 rounded-full bg-white/30">
            <View className="h-1 rounded-full bg-white" style={{ width: `${duration > 0 ? Math.min(100, time / duration * 100) : 0}%` }} />
          </View>
        </View>
      </GestureDetector>
      <Pressable className="min-h-11 justify-center px-2" accessibilityRole="button" onPress={onReset}>
        <NouText className="text-white">{t('feed.resetZoom')}</NouText>
      </Pressable>
    </View>
  )
}
