import type { UserStylesSnapshot } from '../../../lib/user-styles'
import { noraUserStylesEvent } from '../../nora'

export const X_RECOMMENDATION_ATTRIBUTE = 'data-nora-x-recommendation'
const CELL = '[data-testid="cellInnerDiv"]'
const HEADING = 'h1, h2, h3, [role="heading"]'
const POST = '[data-testid="tweet"], [data-testid="tweetText"]'
const USER = '[data-testid="UserCell"]'
const STRUCTURE = `${CELL}, ${HEADING}, ${POST}, ${USER}, [${X_RECOMMENDATION_ATTRIBUTE}]`

/** Ignore frequent text-only timestamp/count mutations; inspect only structural module changes. */
export const shouldScanXRecommendationMutations = (records: readonly MutationRecord[]) =>
  records.some((record) => {
    const target = record.target.nodeType === 1 ? record.target as Element : record.target.parentElement
    if (record.type === 'attributes') {
      if (!target) return false
      if (target.matches(STRUCTURE)) return true
      // Virtualization can remove an identity before the observer receives the record.
      return (record.attributeName === 'role' && record.oldValue === 'heading') ||
        (record.attributeName === 'data-testid' &&
          ['cellInnerDiv', 'tweet', 'tweetText', 'UserCell'].includes(record.oldValue || ''))
    }
    if (record.type !== 'childList') return false
    // Heading label replacement matters, unlike text replacement elsewhere in a cell.
    if (target?.closest(HEADING) && !target.closest(POST)) return true
    return [...record.addedNodes, ...record.removedNodes].some((node) => {
      if (node.nodeType !== 1) return false
      const element = node as Element
      return element.matches(STRUCTURE) || !!element.querySelector(STRUCTURE)
    })
  })

const labels = {
  who: new Set([
    'who to follow', 'おすすめユーザー', 'おすすめのユーザー', '推荐关注', '推薦跟隨', '推薦關注',
    'wem folgen?', 'wem folgen', 'vous pourriez aimer', 'qui suivre', 'a quién seguir',
    'chi seguire', 'quem seguir', 'кого читать', 'кого читати', 'takip edilebilecek kişiler',
    '팔로우 추천',
  ]),
  discover: new Set([
    'discover more', 'もっと見つける', '发现更多', '探索更多',
    'mehr entdecken', 'découvrez plus', 'descubre más', 'scopri di più', 'descubra mais',
    'узнать больше', '더 알아보기',
  ]),
}

export const getXRecommendationHeading = (text: string | null): 'who' | 'discover' | null => {
  const label = (text || '').replace(/[\u200b-\u200f\ufeff]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
  if (labels.who.has(label)) return 'who'
  if (labels.discover.has(label)) return 'discover'
  return null
}

/** Pure DOM scan: never select an ancestor timeline, or infer recommendations from a Follow button on a post. */
export const collectXRecommendationCells = (root: Pick<Document, 'querySelectorAll'>, pathname: string) => {
  const targets = new Set<Element>()
  const onConversation = /^\/[^/]+\/status\/\d+\/?$/.test(pathname)
  for (const heading of root.querySelectorAll(HEADING)) {
    if (heading.closest(POST)) continue
    const kind = getXRecommendationHeading(heading.textContent)
    if (!kind || (kind === 'discover' && !onConversation)) continue
    const cell = heading.closest(CELL)
    // Nested cells indicate an unfamiliar module layout. Never hide its enclosing feed.
    if (!cell || cell.querySelector(CELL) || cell.querySelector(POST)) continue

    if (kind === 'who' && cell.querySelector(USER)) {
      targets.add(cell)
      continue
    }

    const following: Element[] = []
    let next = cell.nextElementSibling
    while (next?.matches(CELL)) {
      if (next.querySelector(CELL) || next.querySelector(HEADING)) break
      const isRecommendation = kind === 'who'
        ? !!next.querySelector(USER) && !next.querySelector(POST)
        : !!next.querySelector('[data-testid="tweet"]')
      if (!isRecommendation) break
      following.push(next)
      next = next.nextElementSibling
    }
    // A heading alone isn't enough evidence for an unknown layout.
    if (following.length) {
      targets.add(cell)
      for (const recommendation of following) targets.add(recommendation)
    }
  }
  return targets
}

interface RecommendationsEnvironment {
  document: Pick<Document, 'querySelectorAll'>
  pathname: () => string
  schedule: (callback: () => void) => void
  observe: (callback: (records: MutationRecord[]) => void) => { disconnect: () => void }
}

/** Separate lifecycle makes disabled behavior and virtualized-cell cleanup testable without a browser. */
export const createXRecommendationsController = (environment: RecommendationsEnvironment) => {
  let enabled = false
  let observer: { disconnect: () => void } | null = null
  let scheduled = false
  let marked = new Set<Element>()

  const clear = () => {
    for (const cell of marked) cell.removeAttribute(X_RECOMMENDATION_ATTRIBUTE)
    // Also remove markers on nodes retained/reinserted by X during SPA navigation.
    for (const cell of environment.document.querySelectorAll(`[${X_RECOMMENDATION_ATTRIBUTE}]`)) {
      cell.removeAttribute(X_RECOMMENDATION_ATTRIBUTE)
    }
    marked.clear()
  }
  const apply = () => {
    scheduled = false
    if (!enabled) return
    const targets = collectXRecommendationCells(environment.document, environment.pathname())
    for (const cell of marked) {
      if (!targets.has(cell)) cell.removeAttribute(X_RECOMMENDATION_ATTRIBUTE)
    }
    for (const cell of targets) {
      if (!cell.hasAttribute(X_RECOMMENDATION_ATTRIBUTE)) cell.setAttribute(X_RECOMMENDATION_ATTRIBUTE, '')
    }
    marked = targets
  }
  const schedule = () => {
    if (!enabled || scheduled) return
    scheduled = true
    environment.schedule(apply)
  }
  const sync = (snapshot?: UserStylesSnapshot | null) => {
    enabled = snapshot?.builtins?.['hide-x-recommendations']?.enabled === true
    if (!enabled) {
      observer?.disconnect()
      observer = null
      clear()
      return
    }
    observer ||= environment.observe((records) => {
      if (shouldScanXRecommendationMutations(records)) schedule()
    })
    schedule()
  }
  return { sync, schedule, dispose: () => sync(null) }
}

export function runXRecommendationsController() {
  const root = window as Window & { __noraXRecommendationsInit?: boolean }
  if (root.__noraXRecommendationsInit) return
  root.__noraXRecommendationsInit = true
  const controller = createXRecommendationsController({
    document,
    pathname: () => location.pathname,
    schedule: (callback) => window.requestAnimationFrame(callback),
    observe: (callback) => {
      const observer = new MutationObserver(callback)
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        // Don't observe our own marker writes.
        attributeFilter: ['data-testid', 'role'],
        attributeOldValue: true,
      })
      return observer
    },
  })
  window.addEventListener(noraUserStylesEvent, () => controller.sync(window.Nora?.getUserStyles?.()))
  window.addEventListener('popstate', controller.schedule)
  controller.sync(window.Nora?.getUserStyles?.())
}
