import * as React from 'react'
import { NoraViewProps } from './NoraView.types'

export default function NoraView(props: NoraViewProps) {
  // @ts-expect-error x
  return <webview {...props} />
}
