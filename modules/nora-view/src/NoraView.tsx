import { requireNativeView } from 'expo';
import * as React from 'react';

import { NoraViewProps } from './NoraView.types';

const NativeView: React.ComponentType<NoraViewProps> =
  requireNativeView('NoraView');

export default function NoraView(props: NoraViewProps) {
  return <NativeView {...props} />;
}
