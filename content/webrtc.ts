/**
 * WebRTC IP leak guard.
 *
 * WebRTC gathers `host` (LAN) and `srflx` (real public IP, learned from STUN)
 * candidates outside the normal page networking stack, so a page can read the
 * device's real address even when the app routes traffic through a proxy or the
 * system is on a VPN. Forcing `relay` transport keeps the peer connection on
 * TURN servers, so calls that use one still work while the local and real
 * public addresses stay hidden.
 *
 * This is bundled separately from `main.ts` because it must run at document
 * start: once page scripts hold a reference to the untouched
 * `RTCPeerConnection`, overriding the global is pointless.
 */

type PeerConnectionCtor = typeof RTCPeerConnection

// The type can be the last token on the line, so the terminator has to allow
// the line ending an SDP candidate carries.
export const isRelayCandidate = (candidate: string) => / typ relay(\s|$)/.test(candidate)

export const scrubSdp = (sdp: string) =>
  sdp.replace(/^a=candidate:.*$\r?\n?/gm, (line) => (isRelayCandidate(line) ? line : ''))

const scrubDescription = <T extends RTCSessionDescription | RTCSessionDescriptionInit | null>(description: T): T => {
  if (!description?.sdp) {
    return description
  }
  const sdp = scrubSdp(description.sdp)
  if (sdp === description.sdp) {
    return description
  }
  if (typeof RTCSessionDescription !== 'undefined' && description instanceof RTCSessionDescription) {
    return new RTCSessionDescription({ type: description.type, sdp }) as T
  }
  return { ...description, sdp } as T
}

const forceRelay = (config?: RTCConfiguration): RTCConfiguration => ({
  ...(config || {}),
  iceTransportPolicy: 'relay',
})

export function installWebRtcGuard() {
  const root = window as Window & typeof globalThis & { __noraWebRtcGuard?: boolean; webkitRTCPeerConnection?: PeerConnectionCtor }
  const Original = root.RTCPeerConnection || root.webkitRTCPeerConnection
  if (root.__noraWebRtcGuard || typeof Original !== 'function') {
    return
  }
  root.__noraWebRtcGuard = true

  // The filters live on the native prototype rather than on a subclass: a
  // subclass would hand the untouched constructor back to the page through its
  // own prototype chain, and connections built from it would gather everything.
  const proto = Original.prototype
  const wrappedListeners = new WeakMap<EventListenerOrEventListenerObject, EventListener>()
  const handlers = new WeakMap<RTCPeerConnection, ((event: Event) => unknown) | null>()

  const passesFilter = (event: Event) => {
    const candidate = (event as RTCPeerConnectionIceEvent).candidate
    // A null candidate marks the end of gathering and has to reach the page.
    return !candidate?.candidate || isRelayCandidate(candidate.candidate)
  }

  const wrapListener = (listener: EventListenerOrEventListenerObject) => {
    const existing = wrappedListeners.get(listener)
    if (existing) {
      return existing
    }
    const wrapped: EventListener = function (this: unknown, event: Event) {
      if (!passesFilter(event)) {
        return
      }
      if (typeof listener === 'function') {
        return listener.call(this, event)
      }
      return listener.handleEvent(event)
    }
    wrappedListeners.set(listener, wrapped)
    return wrapped
  }

  const setConfiguration = proto.setConfiguration
  proto.setConfiguration = function (this: RTCPeerConnection, config?: RTCConfiguration) {
    return setConfiguration.call(this, forceRelay(config))
  }

  const addEventListener = proto.addEventListener
  proto.addEventListener = function (
    this: RTCPeerConnection,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    const target = type === 'icecandidate' && listener ? wrapListener(listener) : listener
    return addEventListener.call(this, type as keyof RTCPeerConnectionEventMap, target as EventListener, options)
  }

  const removeEventListener = proto.removeEventListener
  proto.removeEventListener = function (
    this: RTCPeerConnection,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ) {
    const target = (type === 'icecandidate' && listener && wrappedListeners.get(listener)) || listener
    return removeEventListener.call(this, type as keyof RTCPeerConnectionEventMap, target as EventListener, options)
  }

  for (const name of ['createOffer', 'createAnswer'] as const) {
    const create = proto[name] as (...args: unknown[]) => unknown
    const patched = function (this: RTCPeerConnection, ...args: unknown[]) {
      // The legacy callback form hands the description to a callback instead of
      // resolving with it.
      const success = args[0]
      if (typeof success === 'function') {
        args[0] = (description: RTCSessionDescriptionInit) => success.call(this, scrubDescription(description))
        return create.apply(this, args)
      }
      return (create.apply(this, args) as Promise<RTCSessionDescriptionInit>).then(scrubDescription)
    }
    proto[name] = patched as typeof proto[typeof name]
  }

  const onIceCandidate = Object.getOwnPropertyDescriptor(proto, 'onicecandidate')
  if (onIceCandidate?.set) {
    Object.defineProperty(proto, 'onicecandidate', {
      configurable: true,
      enumerable: true,
      get(this: RTCPeerConnection) {
        return handlers.get(this) || null
      },
      set(this: RTCPeerConnection, handler: ((event: Event) => unknown) | null) {
        handlers.set(this, handler || null)
        onIceCandidate.set!.call(
          this,
          handler
            ? function (this: RTCPeerConnection, event: Event) {
                if (passesFilter(event)) {
                  handler.call(this, event)
                }
              }
            : null,
        )
      },
    })
  }

  for (const key of ['localDescription', 'currentLocalDescription', 'pendingLocalDescription'] as const) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, key)
    if (!descriptor?.get) {
      continue
    }
    Object.defineProperty(proto, key, {
      configurable: true,
      enumerable: true,
      get(this: RTCPeerConnection) {
        return scrubDescription(descriptor.get!.call(this) as RTCSessionDescription | null)
      },
    })
  }

  // Constructing through this wrapper still produces a plain native instance,
  // so `instanceof` and the prototype chain stay exactly as the page expects.
  const NoraRTCPeerConnection = function RTCPeerConnection(this: unknown, config?: RTCConfiguration) {
    if (!new.target) {
      throw new TypeError("Failed to construct 'RTCPeerConnection': Please use the 'new' operator")
    }
    return Reflect.construct(Original, [forceRelay(config)], new.target)
  } as unknown as PeerConnectionCtor

  NoraRTCPeerConnection.prototype = proto
  for (const key of Object.getOwnPropertyNames(Original)) {
    if (key === 'prototype' || key === 'length' || key === 'name') {
      continue
    }
    const descriptor = Object.getOwnPropertyDescriptor(Original, key)
    if (descriptor) {
      Object.defineProperty(NoraRTCPeerConnection, key, descriptor)
    }
  }
  // Otherwise `pc.constructor` leads straight back to the untouched constructor.
  Object.defineProperty(proto, 'constructor', {
    configurable: true,
    writable: true,
    value: NoraRTCPeerConnection,
  })

  const originalToString = Function.prototype.toString
  Object.defineProperty(NoraRTCPeerConnection, 'toString', {
    configurable: true,
    writable: true,
    value: () => originalToString.call(Original),
  })

  const define = (name: string) => {
    try {
      Object.defineProperty(root, name, {
        configurable: true,
        writable: true,
        value: NoraRTCPeerConnection,
      })
    } catch {
      // A frame may have locked the global down; nothing to do.
    }
  }

  define('RTCPeerConnection')
  if (root.webkitRTCPeerConnection) {
    define('webkitRTCPeerConnection')
  }
}

try {
  if (typeof window !== 'undefined') {
    installWebRtcGuard()
  }
} catch (e) {
  console.error('[nora] failed to install WebRTC guard', e)
}
