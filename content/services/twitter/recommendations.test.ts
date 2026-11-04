import { describe, expect, it } from 'bun:test'
import { load, type CheerioAPI } from 'cheerio'
import { normalizeUserStyles } from '../../../lib/user-styles'
import {
  collectXRecommendationCells,
  createXRecommendationsController,
  getXRecommendationHeading,
  shouldScanXRecommendationMutations,
  X_RECOMMENDATION_ATTRIBUTE,
} from './recommendations'

// Small DOM adapter over real parsed HTML; no browser dependency or global mocks.
const fixture = (html: string) => {
  const $ = load(html)
  type Node = Parameters<CheerioAPI>[0]
  const cache = new Map<Node, Element>()
  const wrap = (node: Node): Element => {
    if (cache.has(node)) return cache.get(node)!
    const element = {
      nodeType: 1,
      get textContent() { return $(node).text() },
      get nextElementSibling() {
        const next = $(node).next()[0]
        return next ? wrap(next) : null
      },
      get parentElement() {
        const parent = $(node).parent()[0]
        return parent ? wrap(parent) : null
      },
      matches: (selector: string) => $(node).is(selector),
      closest: (selector: string) => {
        const match = $(node).closest(selector)[0]
        return match ? wrap(match) : null
      },
      querySelector: (selector: string) => {
        const match = $(node).find(selector)[0]
        return match ? wrap(match) : null
      },
      hasAttribute: (name: string) => $(node).attr(name) !== undefined,
      setAttribute: (name: string, value: string) => { $(node).attr(name, value) },
      removeAttribute: (name: string) => { $(node).removeAttr(name) },
      getAttribute: (name: string) => $(node).attr(name) ?? null,
    } as unknown as Element
    cache.set(node, element)
    return element
  }
  const document = {
    querySelectorAll: (selector: string) => $(selector).toArray().map(wrap),
  } as unknown as Pick<Document, 'querySelectorAll'>
  return { $, document }
}

const cell = (id: string, content: string) => `<div data-testid="cellInnerDiv" id="${id}">${content}</div>`
const tweet = (text = 'Post') => `<article data-testid="tweet"><div data-testid="tweetText">${text}</div></article>`
const user = '<div data-testid="UserCell"><button data-testid="123-follow">Follow</button></div>'
const ids = (elements: Set<Element>) => [...elements].map((element) => element.getAttribute('id'))
const enabled = normalizeUserStyles({ builtins: { 'hide-x-recommendations': { enabled: true } } as any })

const mutation = (target: Element, addedNodes: Node[] = [], removedNodes: Node[] = []) => ({
  type: 'childList', target, addedNodes, removedNodes,
}) as unknown as MutationRecord

describe('X recommendation mutation filtering', () => {
  it('ignores count/timestamp text and ordinary inline markup replacements', () => {
    const { document } = fixture(cell('post', tweet('<time id="time">1m</time><span id="count">2</span>')))
    const time = document.querySelectorAll('#time')[0]!
    const count = document.querySelectorAll('#count')[0]!
    const text = { nodeType: 3, parentElement: count } as unknown as Node
    expect(shouldScanXRecommendationMutations([mutation(time, [text], [text])])).toBe(false)
    expect(shouldScanXRecommendationMutations([mutation(count, [text])])).toBe(false)
    expect(shouldScanXRecommendationMutations([mutation(count, [time])])).toBe(false)
    expect(shouldScanXRecommendationMutations([
      { type: 'characterData', target: text } as MutationRecord,
    ])).toBe(false)
  })

  it('detects added modules, later suggested tweet cells, removals, and heading text replacement', () => {
    const { document } = fixture(`<main id="timeline">${cell('heading', '<h2 id="label">Discover more</h2>')}
      ${cell('suggestion', tweet())}<section id="wrapper">${cell('who', '<h2>Who to follow</h2>' + user)}</section></main>`)
    const get = (selector: string) => document.querySelectorAll(selector)[0]!
    for (const selector of ['#heading', '#suggestion', '#wrapper']) {
      expect(shouldScanXRecommendationMutations([mutation(get('#timeline'), [get(selector)])])).toBe(true)
      expect(shouldScanXRecommendationMutations([mutation(get('#timeline'), [], [get(selector)])])).toBe(true)
    }
    expect(shouldScanXRecommendationMutations([mutation(get('#label'))])).toBe(true)
    // Recycled cells may replace their article without replacing the cell itself.
    expect(shouldScanXRecommendationMutations([mutation(get('#suggestion'), [], [get('[data-testid="tweet"]')])])).toBe(true)
  })

  it('detects virtualized identity changes including removed roles/test IDs', () => {
    const { document } = fixture('<div id="recycled"></div><div id="new-cell" data-testid="cellInnerDiv"></div>')
    const recycled = document.querySelectorAll('#recycled')[0]!
    for (const [attributeName, oldValue] of [['role', 'heading'], ['data-testid', 'cellInnerDiv'], ['data-testid', 'tweet']]) {
      expect(shouldScanXRecommendationMutations([
        { type: 'attributes', target: recycled, attributeName, oldValue } as unknown as MutationRecord,
      ])).toBe(true)
    }
    expect(shouldScanXRecommendationMutations([
      { type: 'attributes', target: document.querySelectorAll('#new-cell')[0], attributeName: 'data-testid' } as unknown as MutationRecord,
    ])).toBe(true)
  })
})

describe('X mobile recommendation cells', () => {
  it('recognizes exact normalized and localized headings, not phrases in post text', () => {
    expect(getXRecommendationHeading(' Who \n to follow ')).toBe('who')
    expect(getXRecommendationHeading('おすすめユーザー')).toBe('who')
    expect(getXRecommendationHeading('Wem folgen?')).toBe('who')
    expect(getXRecommendationHeading('Discover more')).toBe('discover')
    expect(getXRecommendationHeading('もっと見つける')).toBe('discover')
    expect(getXRecommendationHeading('Show more')).toBeNull()
    expect(getXRecommendationHeading('I want to Discover more posts')).toBeNull()
  })

  it('marks a mobile Who to follow module but preserves followed tweets and its enclosing timeline', () => {
    const { document } = fixture(`<main id="timeline">${cell('followed', tweet('Who to follow'))}
      ${cell('who', '<h2>Who to follow</h2>' + user)}${cell('next-post', tweet())}</main>`)
    expect(ids(collectXRecommendationCells(document, '/home'))).toEqual(['who'])
  })

  it('supports separate heading/UserCell rows, stopping before an ordinary post', () => {
    const { document } = fixture(`<main>${cell('heading', '<div role="heading">おすすめユーザー</div>')}
      ${cell('person-1', user)}${cell('person-2', user)}${cell('followed', tweet())}</main>`)
    expect(ids(collectXRecommendationCells(document, '/home'))).toEqual(['heading', 'person-1', 'person-2'])
  })

  it('marks only contiguous Discover more cells after the heading on a conversation URL', () => {
    const { document } = fixture(`<main id="conversation">${cell('original', tweet())}
      ${cell('reply', tweet('<h2>Discover more</h2>'))}${cell('discover', '<h2>Discover more</h2>')}
      ${cell('suggested-1', tweet())}${cell('suggested-2', tweet())}
      ${cell('boundary', '<h2>Other section</h2>')}${cell('later', tweet())}</main>`)
    expect(ids(collectXRecommendationCells(document, '/alice/status/123'))).toEqual([
      'discover', 'suggested-1', 'suggested-2',
    ])
    expect(ids(collectXRecommendationCells(document, '/home'))).toEqual([])
    expect(ids(collectXRecommendationCells(document, '/alice/status/123/likes'))).toEqual([])
  })

  it('does not infer recommendations from arbitrary wrappers, headings in posts, or nested timelines', () => {
    const { document } = fixture(`<main><h2>Discover more</h2>${cell('ordinary', tweet())}
      ${cell('quoted-heading', tweet('<h2>Who to follow</h2>' + user))}
      ${cell('outer-timeline', '<h2>Who to follow</h2>' + cell('nested-post', tweet()) + user)}
      ${cell('unknown', '<h2>Discover more</h2>')}<div>${cell('nested-suggestion', tweet())}</div>
      ${cell('orphan-heading', '<h2>Who to follow</h2>')}${cell('normal-post', tweet())}</main>`)
    expect(ids(collectXRecommendationCells(document, '/alice/status/123'))).toEqual([])
  })
})

describe('X recommendations controller lifecycle', () => {
  const harness = () => {
    const { $, document } = fixture(`<main>${cell('heading', '<h2>Who to follow</h2>')}${cell('person', user)}</main>`)
    const queue: (() => void)[] = []
    let callback = (_records: MutationRecord[]) => {}
    let observations = 0
    let disconnects = 0
    let path = '/home'
    const controller = createXRecommendationsController({
      document,
      pathname: () => path,
      schedule: (task) => { queue.push(task) },
      observe: (task) => {
        observations++
        callback = task
        return { disconnect: () => { disconnects++ } }
      },
    })
    return {
      $, controller, queue,
      flush: () => { while (queue.length) queue.shift()!() },
      mutate: () => callback([mutation(document.querySelectorAll('main')[0]!, [], [
        { nodeType: 1, matches: () => true } as unknown as Node,
      ])]),
      mutateText: () => callback([mutation(document.querySelectorAll('#person')[0]!, [
        { nodeType: 3 } as unknown as Node,
      ])]),
      setPath: (value: string) => { path = value },
      get observations() { return observations },
      get disconnects() { return disconnects },
      marked: () => $(`[${X_RECOMMENDATION_ATTRIBUTE}]`).map((_, node) => $(node).attr('id')).get(),
    }
  }

  it('does no observation or scheduled scans until explicitly opted in', () => {
    const h = harness()
    h.controller.sync()
    h.controller.sync(normalizeUserStyles({}))
    expect(h.observations).toBe(0)
    expect(h.queue.length).toBe(0)
    expect(h.marked()).toEqual([])
    h.controller.sync(enabled)
    h.controller.sync(enabled)
    expect(h.observations).toBe(1)
    expect(h.queue.length).toBe(1)
    h.flush()
    expect(h.marked()).toEqual(['heading', 'person'])
  })

  it('disconnects and removes all markers immediately when disabled, including pending work', () => {
    const h = harness()
    h.controller.sync(enabled)
    h.flush()
    h.$('main').append(`<div id="stale" ${X_RECOMMENDATION_ATTRIBUTE}></div>`)
    h.mutate()
    h.controller.sync(normalizeUserStyles({}))
    expect(h.disconnects).toBe(1)
    expect(h.marked()).toEqual([])
    h.flush()
    expect(h.marked()).toEqual([])
    h.controller.sync(enabled)
    h.flush()
    expect(h.observations).toBe(2)
    expect(h.marked()).toEqual(['heading', 'person'])
    h.controller.dispose()
    expect(h.disconnects).toBe(2)
    expect(h.marked()).toEqual([])
  })

  it('does not schedule a heading rescan for ordinary text-only mutations', () => {
    const h = harness()
    h.controller.sync(enabled)
    h.flush()
    h.mutateText()
    expect(h.queue).toHaveLength(0)
    h.mutate()
    h.mutate()
    expect(h.queue).toHaveLength(1)
    h.flush()
    expect(h.marked()).toEqual(['heading', 'person'])
  })

  it('rechecks recycled cells and removes stale markers when navigation or content changes', () => {
    const h = harness()
    h.controller.sync(enabled)
    h.flush()
    h.$('#person').html(tweet())
    h.mutate()
    h.flush()
    expect(h.marked()).toEqual([])
    h.$('#heading').html('<h2>Discover more</h2>')
    h.setPath('/alice/status/123')
    h.mutate()
    h.flush()
    expect(h.marked()).toEqual(['heading', 'person'])
    h.setPath('/home')
    h.controller.schedule()
    h.flush()
    expect(h.marked()).toEqual([])
  })
})
