import * as React from 'react'
import { NoraViewProps } from './NoraView.types'

export default function NoraView(props: NoraViewProps) {
  // The Electron <webview> is a DOM element that only understands lowercase string
  // attributes. Drop the native-only props (they are no-ops here and React warns about
  // boolean/camelCase attributes like `inspectable={false}` and `textZoom`).
  const { inspectable, textZoom, scriptOnStart, profile, onLoad, onMessage, ...rest } = props
  // @ts-expect-error webview is an Electron custom element
  return <webview {...rest} />
}
