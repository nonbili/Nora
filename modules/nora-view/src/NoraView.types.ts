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
  /** Emit `scroll` messages per touch sample. Android only; off unless a setting reads them. */
  scrollEvents?: boolean
  /**
   * Whether the view is on screen. A hidden view keeps its page, scroll position and
   * media, but is hidden from the web engine so it stops rendering and its timers are
   * throttled. Native platforms only. Defaults to true.
   */
  visible?: boolean
  onLoad?: (event: { nativeEvent: OnLoadEventPayload }) => void
  onMessage?: (event: { nativeEvent: OnMessageEventPayload }) => void
}
