import { observable } from '@legendapp/state'
import { Asset } from 'expo-asset'

/**
 * Source of the WebRTC guard (`content/webrtc.ts`), injected at document start
 * so it runs before page scripts can capture the untouched
 * `RTCPeerConnection`. Empty until the asset is read, and only handed to a
 * webview while `protectWebRtcIp` is on.
 */
export const webRtcGuardScript$ = observable('')

export const loadWebRtcGuardScript = async () => {
  if (webRtcGuardScript$.get()) {
    return
  }
  const [{ localUri }] = await Asset.loadAsync(require('../assets/scripts/webrtc.bjs'))
  if (!localUri) {
    return
  }
  const res = await fetch(localUri)
  webRtcGuardScript$.set(await res.text())
}
