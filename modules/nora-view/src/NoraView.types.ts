import { StyleProp } from 'react-native'

export type OnLoadEventPayload = {
  canGoBack?: boolean
  url?: string
  title?: string
  icon?: string
}

export type OnMessageEventPayload = {
  payload: string
}

export type NoraViewProps = {
  className?: string
  style?: StyleProp<any>
  ref: React.Ref<any>
  useragent: string
  partition?: string
  profile?: string
  inspectable?: boolean
  allowpopups?: string
  src?: string
  scriptOnStart?: string
  /** Injected before page scripts run (WebRTC guard). Native platforms only. */
  scriptOnDocumentStart?: string
  textZoom?: number
  /** Reload the page when the user drags down from the top. Native platforms only. */
  pullToRefresh?: boolean
  /** False for a tab out of sight: the page is paused (Android) or hidden with its media suspended (iOS). Native platforms only. */
  active?: boolean
  /** False for a tab out of sight. iOS hides the webview; a visible but inactive (paused) tab keeps showing its page. iOS only. */
  visible?: boolean
  /** Emit `scroll` messages per touch sample. Android only; off unless a setting reads them. */
  scrollEvents?: boolean
  onLoad?: (event: { nativeEvent: OnLoadEventPayload }) => void
  onMessage?: (event: { nativeEvent: OnMessageEventPayload }) => void
}
