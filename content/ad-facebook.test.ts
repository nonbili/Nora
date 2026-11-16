import { afterAll, describe, expect, it } from 'bun:test'
import { collectFacebookMobileAdCandidates } from './services/facebook'

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window')
let enabled = true
Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: { location: { host: 'm.facebook.com' }, querySelector: () => null },
})
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: { Nora: { getSettings: () => ({ adBlockingEnabled: enabled }) } },
})
const { hideAds } = await import('./ad')

afterAll(() => {
  for (const [key, descriptor] of [['document', originalDocument], ['window', originalWindow]] as const) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor)
    else Reflect.deleteProperty(globalThis, key)
  }
})

const post = (label = '') => {
  const meta = { textContent: label, previousElementSibling: { getAttribute: () => 'TextArea' } }
  const element = {
    nodeType: 1,
    isConnected: true,
    parentElement: null,
    dataset: {} as Record<string, string>,
    style: { display: '' },
    closest: () => element,
    querySelector: () => meta,
    querySelectorAll: () => [],
  }
  return { element, meta }
}
const mutate = async (target: unknown, addedNodes: unknown[] = []) => {
  hideAds([{ target, addedNodes } as unknown as MutationRecord])
  await new Promise(resolve => setTimeout(resolve, 20))
}

describe('mobile Facebook ad mutations', () => {
  it('does not traverse an existing parent subtree for an added text node', () => {
    const { element } = post()
    const parent = {
      closest: () => element,
      querySelectorAll: () => { throw new Error('must not walk an existing subtree') },
    }
    const candidates = new Set<HTMLElement>()
    collectFacebookMobileAdCandidates({ nodeType: 3, parentElement: parent } as unknown as Node, candidates)
    expect(candidates.has(element as unknown as HTMLElement)).toBe(true)
  })

  it('does not rescan or re-hide an already hidden ad', async () => {
    const { element } = post('Sponsored')
    await mutate(element, [element])
    expect(element.dataset.noraHiddenAd).toBe('1')
    element.querySelector = () => { throw new Error('must not rescan hidden ads') }
    await mutate(element)
    expect(element.style.display).toBe('none')
  })

  it('hides a label populated after the post was inserted', async () => {
    const { element, meta } = post()
    await mutate(element, [element])
    expect(element.style.display).toBe('')
    meta.textContent = 'Sponsored'
    const header = { nodeType: 1, closest: () => element, querySelectorAll: () => [] }
    await mutate(header, [{ nodeType: 3, parentElement: header }])
    expect(element.style.display).toBe('none')
  })

  it('rescans a post when an existing label text node changes', async () => {
    const { element, meta } = post('1h')
    meta.textContent = '広告: '
    await mutate({ nodeType: 3, parentElement: { closest: () => element } })
    expect(element.style.display).toBe('none')
  })

  it('finds posts inside an added wrapper or the initial document', async () => {
    const { element } = post('Sponsored')
    const wrapper = { nodeType: 1, closest: () => null, querySelectorAll: () => [element] }
    await mutate(wrapper, [wrapper])
    expect(element.style.display).toBe('none')
  })

  it('leaves ordinary posts and disabled ad blocking alone', async () => {
    const ordinary = post('1h').element
    await mutate(ordinary, [ordinary])
    expect(ordinary.style.display).toBe('')
    enabled = false
    try {
      const ad = post('Sponsored').element
      await mutate(ad, [ad])
      expect(ad.style.display).toBe('')
    } finally {
      enabled = true
    }
  })
})
