import { mock } from 'bun:test'
import { useState } from 'react'

export const testVideoPlayers: TestVideoPlayer[] = []
export class TestVideoPlayer {
  playing = false
  loop = false
  playbackRate = 1
  currentTime = 0
  duration = 120
  timeUpdateEventInterval = 0
  play() { this.playing = true }
  pause() { this.playing = false }
  addListener() { return { remove() {} } }
}

// As with the gesture/native-view mocks, all component tests share the same native
// boundary. Each hook still owns an independent player and its playback state.
mock.module('expo-video', () => ({
  VideoView: 'VideoView',
  useVideoPlayer: (_source: unknown, setup: (value: TestVideoPlayer) => void) => useState(() => {
    const player = new TestVideoPlayer()
    testVideoPlayers.push(player)
    setup(player)
    return player
  })[0],
}))
