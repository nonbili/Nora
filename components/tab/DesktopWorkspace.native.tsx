import React from 'react'
import { NativeTabHost } from './NativeTabHost'

// The native workspace is the desktop-layout mode of the shared tab host, which also
// renders the phone layout so that switching between the two keeps every webview mounted.
export const DesktopWorkspace: React.FC = () => <NativeTabHost desktopLayout />
