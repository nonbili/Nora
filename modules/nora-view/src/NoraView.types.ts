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
  textZoom?: number
  onLoad?: (event: { nativeEvent: OnLoadEventPayload }) => void
  onMessage?: (event: { nativeEvent: OnMessageEventPayload }) => void
}
