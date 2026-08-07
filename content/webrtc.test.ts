import { describe, expect, it } from 'bun:test'
import { installWebRtcGuard, isRelayCandidate, scrubSdp } from './webrtc'

describe('isRelayCandidate', () => {
  for (const [candidate, expected] of [
    ['candidate:1 1 udp 2113937151 192.168.1.20 52000 typ host generation 0', false],
    ['candidate:2 1 udp 1677729535 203.0.113.7 52001 typ srflx raddr 192.168.1.20 rport 52000', false],
    ['candidate:3 1 udp 41885439 198.51.100.9 52002 typ relay raddr 203.0.113.7 rport 52001', true],
    ['candidate:4 1 udp 41885439 198.51.100.9 52002 typ relay', true],
    // The address of a relay candidate must not be mistaken for the type.
    ['candidate:5 1 udp 2113937151 10.0.0.1 52003 typ host network-id 1 relay', false],
  ] as const) {
    it(`${candidate.slice(0, 40)}… => ${expected}`, () => {
      expect(isRelayCandidate(candidate)).toBe(expected)
    })
  }
})

describe('scrubSdp', () => {
  it('keeps only relay candidates and leaves the rest of the SDP intact', () => {
    const sdp = [
      'v=0',
      'm=audio 9 UDP/TLS/RTP/SAVPF 111',
      'a=candidate:1 1 udp 2113937151 192.168.1.20 52000 typ host generation 0',
      'a=candidate:2 1 udp 1677729535 203.0.113.7 52001 typ srflx raddr 192.168.1.20 rport 52000',
      'a=candidate:3 1 udp 41885439 198.51.100.9 52002 typ relay raddr 203.0.113.7 rport 52001',
      'a=end-of-candidates',
      '',
    ].join('\r\n')

    expect(scrubSdp(sdp)).toBe(
      [
        'v=0',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=candidate:3 1 udp 41885439 198.51.100.9 52002 typ relay raddr 203.0.113.7 rport 52001',
        'a=end-of-candidates',
        '',
      ].join('\r\n'),
    )
  })

  it('returns an SDP without candidates unchanged', () => {
    const sdp = 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n'
    expect(scrubSdp(sdp)).toBe(sdp)
  })
})

describe('installWebRtcGuard', () => {
  const hostCandidate = 'candidate:1 1 udp 2113937151 192.168.1.20 52000 typ host generation 0'
  const relayCandidate = 'candidate:3 1 udp 41885439 198.51.100.9 52002 typ relay'

  class FakePeerConnection {
    config: RTCConfiguration | undefined
    listeners: EventListener[] = []
    handler: ((event: Event) => unknown) | null = null
    sdp = `v=0\r\na=candidate:${hostCandidate.slice('candidate:'.length)}\r\na=candidate:${relayCandidate.slice('candidate:'.length)}\r\n`

    constructor(config?: RTCConfiguration) {
      this.config = config
    }

    setConfiguration(config?: RTCConfiguration) {
      this.config = config
    }

    addEventListener(type: string, listener: EventListener) {
      if (type === 'icecandidate') this.listeners.push(listener)
    }

    removeEventListener(type: string, listener: EventListener) {
      if (type === 'icecandidate') this.listeners = this.listeners.filter((entry) => entry !== listener)
    }

    createOffer() {
      return Promise.resolve({ type: 'offer', sdp: this.sdp } as RTCSessionDescriptionInit)
    }

    createAnswer() {
      return Promise.resolve({ type: 'answer', sdp: this.sdp } as RTCSessionDescriptionInit)
    }

    get localDescription() {
      return { type: 'offer', sdp: this.sdp } as RTCSessionDescriptionInit
    }

    get onicecandidate() {
      return this.handler
    }

    set onicecandidate(handler: ((event: Event) => unknown) | null) {
      this.handler = handler
    }

    emit(candidate: string | null) {
      const event = { candidate: candidate ? { candidate } : null } as unknown as Event
      this.handler?.call(this, event)
      this.listeners.forEach((listener) => listener.call(this, event))
    }
  }

  const globals = globalThis as unknown as { window?: unknown; RTCPeerConnection?: unknown }
  globals.window = globals
  globals.RTCPeerConnection = FakePeerConnection
  installWebRtcGuard()
  const Guarded = globals.RTCPeerConnection as unknown as typeof FakePeerConnection

  it('does not expose the untouched constructor', () => {
    expect(Guarded).not.toBe(FakePeerConnection)
    expect(Object.getPrototypeOf(Guarded)).not.toBe(FakePeerConnection)
    expect(FakePeerConnection.prototype.constructor).toBe(Guarded)
  })

  it('builds native instances that force relay transport', () => {
    const pc = new Guarded({ iceTransportPolicy: 'all', iceServers: [] })
    expect(pc).toBeInstanceOf(FakePeerConnection)
    expect(pc.config).toEqual({ iceTransportPolicy: 'relay', iceServers: [] })
    pc.setConfiguration({ iceTransportPolicy: 'all' })
    expect(pc.config?.iceTransportPolicy).toBe('relay')
  })

  it('delivers only relay and end-of-gathering candidates', () => {
    const pc = new Guarded()
    const viaHandler: (string | null)[] = []
    const viaListener: (string | null)[] = []
    pc.onicecandidate = (event) => viaHandler.push((event as RTCPeerConnectionIceEvent).candidate?.candidate ?? null)
    const listener = (event: Event) => viaListener.push((event as RTCPeerConnectionIceEvent).candidate?.candidate ?? null)
    pc.addEventListener('icecandidate', listener as EventListener)

    pc.emit(hostCandidate)
    pc.emit(relayCandidate)
    pc.emit(null)

    expect(viaHandler).toEqual([relayCandidate, null])
    expect(viaListener).toEqual([relayCandidate, null])
    expect(typeof pc.onicecandidate).toBe('function')

    pc.removeEventListener('icecandidate', listener as EventListener)
    pc.emit(relayCandidate)
    expect(viaListener).toEqual([relayCandidate, null])
  })

  it('scrubs offers, answers and the local description', async () => {
    const pc = new Guarded()
    expect((await pc.createOffer()).sdp).not.toContain('typ host')
    expect((await pc.createAnswer()).sdp).toContain('typ relay')
    expect(pc.localDescription.sdp).not.toContain('typ host')
  })
})
