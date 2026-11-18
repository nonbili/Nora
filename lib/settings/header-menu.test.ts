import { describe, expect, it } from 'bun:test'
import { headerMenuOptions, normalizeHiddenHeaderMenuActions, visibleHeaderMenuActions } from './header-menu'

describe('header menu customization', () => {
  it('discards invalid and duplicate IDs and never accepts Settings as hidden', () => {
    expect(normalizeHiddenHeaderMenuActions(['share', 'settings', 'share', 42, 'unknown', 'tools'])).toEqual(['share', 'tools'])
    expect(normalizeHiddenHeaderMenuActions('share')).toEqual([])
  })

  it('only offers customizable actions supported on the platform', () => {
    expect(headerMenuOptions('web').map(({ id }) => id)).toEqual(['feed', 'tools'])
    expect(headerMenuOptions('ios').map(({ id }) => id)).toContain('findInPage')
    expect(headerMenuOptions('ios').map(({ id }) => id)).not.toContain('addToHomeScreen')
    expect(headerMenuOptions('android').map(({ id }) => id)).toContain('addToHomeScreen')
    expect(headerMenuOptions('android').map(({ id }) => id)).not.toContain('settings')
  })

  it('preserves the order of available actions and restores it on reset', () => {
    const available = [{ id: 'reload' }, { id: 'scrollToTop' }, { id: 'share' }] as const
    expect(visibleHeaderMenuActions(available, ['scrollToTop', 'findInPage'])).toEqual([available[0], available[2]])
    expect(visibleHeaderMenuActions(available, [])).toEqual([...available])
  })
})
