import { StyleProp } from 'react-native'

export type OnLoadEventPayload = {
  url: string
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
  allowpopups?: string
  scriptOnStart?: string
  onLoad?: (event: { nativeEvent: OnLoadEventPayload }) => void
  onMessage?: (event: { nativeEvent: OnMessageEventPayload }) => void
}
