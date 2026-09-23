// Runs in the isolated world. A CustomEvent's detail doesn't cross worlds, so the page
// world can only send a bare signal, which page scripts can also fake. Only act on it
// while the frame has transient user activation, which a notification click grants and
// page scripts can't forge.
export function observeNotificationClicks(activate: () => void) {
  const userActivation = navigator.userActivation
  window.addEventListener('nora-notification-click', () => {
    if (userActivation.isActive) activate()
  })
}

// Runs in the page world. Return the original native object without reading its
// properties or redispatching its events; only listen for clicks to signal the isolated world.
export function installNotificationClickHandler() {
  if (typeof window.Notification !== 'function') return
  const dispatch = window.dispatchEvent.bind(window)
  const addListener = EventTarget.prototype.addEventListener
  const Signal = Event
  window.Notification = new Proxy(window.Notification, {
    construct(target, args, newTarget) {
      const notification = Reflect.construct(target, args, newTarget)
      try {
        addListener.call(notification, 'click', () => dispatch(new Signal('nora-notification-click')))
      } catch {
        // Observation is best-effort and must never break native construction.
      }
      return notification
    },
  })
}

export function setupNotificationClicks(
  observe: () => void,
  inject: () => Promise<unknown>,
  reportError: (error: unknown) => void,
) {
  try {
    observe()
    void inject().catch(reportError)
  } catch (error) {
    reportError(error)
  }
}
