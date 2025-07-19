import { NativeModule, requireNativeModule } from 'expo'

declare class NoraViewModule extends NativeModule {}

export default requireNativeModule<NoraViewModule>('NoraView')
