// Run in the isolated world. The DOM signal only registers a native object for
// observation; it never authorizes activation. Brand-check it using a native
// getter, and attach our listener using the isolated world's EventTarget method.
export function observeNotificationClicks(activate: () => void) {
  const getTitle = Object.getOwnPropertyDescriptor(Notification.prototype, 'title')!.get!
  const getDetail = Object.getOwnPropertyDescriptor(CustomEvent.prototype, 'detail')!.get!
  const addListener = EventTarget.prototype.addEventListener
  const observed = new WeakSet<object>()
  window.addEventListener('nora-notification-created', (signal) => {
    try {
      const notification = getDetail.call(signal) as Notification
      getTitle.call(notification)
      if (observed.has(notification)) return
      observed.add(notification)
      addListener.call(notification, 'click', (event) => {
        if (event.isTrusted) activate()
      })
    } catch {
      // Page scripts can send arbitrary signals, including non-notifications.
    }
  })
}

// Runs in the page world. Return the original native object without reading its
// properties or redispatching its events, preserving trusted clicks/user activation.
export function installNotificationClickHandler() {
  if (typeof window.Notification !== 'function') return
  const dispatch = window.dispatchEvent.bind(window)
  const Signal = CustomEvent
  window.Notification = new Proxy(window.Notification, {
    construct(target, args, newTarget) {
      const notification = Reflect.construct(target, args, newTarget)
      try {
        dispatch(new Signal('nora-notification-created', { detail: notification }))
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
