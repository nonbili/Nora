import { mock } from 'bun:test'

// Gesture builders are native leaves too. Keep their mocks shared so a component
// test cannot replace the module with a partial export and break later test files.
export class TestGesture {
  handlers: Record<string, (...args: any[]) => void> = {}
  runOnJS() { return this }
  enabled() { return this }
  maxPointers() { return this }
  mouseButton() { return this }
  activateAfterLongPress() { return this }
  activeOffsetX() { return this }
  failOffsetY() { return this }
  numberOfTaps() { return this }
  minDistance() { return this }
  onTouchesDown(handler: (...args: any[]) => void) { this.handlers.onTouchesDown = handler; return this }
  onBegin(handler: (...args: any[]) => void) { this.handlers.onBegin = handler; return this }
  onStart(handler: (...args: any[]) => void) { this.handlers.onStart = handler; return this }
  onUpdate(handler: (...args: any[]) => void) { this.handlers.onUpdate = handler; return this }
  onEnd(handler: (...args: any[]) => void) { this.handlers.onEnd = handler; return this }
  onFinalize(handler: (...args: any[]) => void) { this.handlers.onFinalize = handler; return this }
}
mock.module('react-native-gesture-handler', () => ({
  Gesture: {
    Pan: () => new TestGesture(),
    Pinch: () => new TestGesture(),
    Tap: () => new TestGesture(),
    Simultaneous: (...gestures: TestGesture[]) => ({ gestures }),
  },
  GestureDetector: 'GestureDetector',
  GestureHandlerRootView: 'GestureHandlerRootView',
  MouseButton: { LEFT: 1, MIDDLE: 4 },
  PointerType: { TOUCH: 0, STYLUS: 1, MOUSE: 2 },
}))
