export type OnLoadEventPayload = {
  url: string
}

export type NoraViewProps = {
  url: string
  onLoad: (event: { nativeEvent: OnLoadEventPayload }) => void
}
