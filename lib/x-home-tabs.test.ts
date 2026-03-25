import { describe, expect, it } from 'bun:test'
import { normalizeXHomeTimeline, resolveXHomeTabsDecision } from './settings/twitter'

describe('normalizeXHomeTimeline', () => {
  it('defaults unknown values to for-you', () => {
    expect(normalizeXHomeTimeline(undefined)).toBe('for-you')
    expect(normalizeXHomeTimeline('anything-else')).toBe('for-you')
  })

  it('preserves following', () => {
    expect(normalizeXHomeTimeline('following')).toBe('following')
  })
})

describe('resolveXHomeTabsDecision', () => {
  it('switches to the configured timeline before hiding', () => {
    expect(
      resolveXHomeTabsDecision(
        { xDefaultHomeTimeline: 'following', hideXHomeTimelineTabs: true },
        { activeTimeline: 'for-you', tabsHidden: false },
      ),
    ).toEqual({
      revealTabs: false,
      switchTo: 'following',
      hideTabs: false,
    })
  })

  it('reveals tabs before switching if they are currently hidden', () => {
    expect(
      resolveXHomeTabsDecision(
        { xDefaultHomeTimeline: 'following', hideXHomeTimelineTabs: true },
        { activeTimeline: 'for-you', tabsHidden: true },
      ),
    ).toEqual({
      revealTabs: true,
      switchTo: 'following',
      hideTabs: false,
    })
  })

  it('hides tabs once the configured timeline is active', () => {
    expect(
      resolveXHomeTabsDecision(
        { xDefaultHomeTimeline: 'following', hideXHomeTimelineTabs: true },
        { activeTimeline: 'following', tabsHidden: false },
      ),
    ).toEqual({
      revealTabs: false,
      switchTo: null,
      hideTabs: true,
    })
  })

  it('keeps tabs visible when hiding is disabled', () => {
    expect(
      resolveXHomeTabsDecision(
        { xDefaultHomeTimeline: 'for-you', hideXHomeTimelineTabs: false },
        { activeTimeline: 'for-you', tabsHidden: false },
      ),
    ).toEqual({
      revealTabs: false,
      switchTo: null,
      hideTabs: false,
    })
  })
})
