import { describe, expect, it } from 'bun:test'
import { moveTabPosition } from './tab-reorder'

describe('tab drag positions', () => {
  const initial = { tab1: 0, tab2: 1, tab3: 2, tab4: 3 }

  it('moves tab3 into tab2’s place while tab2 is dragged over it', () => {
    expect(moveTabPosition(initial, 'tab2', 2)).toEqual({ tab1: 0, tab2: 2, tab3: 1, tab4: 3 })
    expect(initial.tab2).toBe(1)
  })

  it('keeps intervening tabs in order when crossing multiple slots', () => {
    expect(moveTabPosition(initial, 'tab2', 3)).toEqual({ tab1: 0, tab2: 3, tab3: 1, tab4: 2 })
    expect(moveTabPosition(initial, 'tab4', 1)).toEqual({ tab1: 0, tab2: 2, tab3: 3, tab4: 1 })
  })

  it('returns to the original order when dragged back through shifted rows', () => {
    const moved = moveTabPosition(initial, 'tab2', 3)
    expect(moveTabPosition(moved, 'tab2', 1)).toEqual(initial)
  })

  it('ignores missing tabs and unchanged slots', () => {
    expect(moveTabPosition(initial, 'closed', 1)).toBe(initial)
    expect(moveTabPosition(initial, 'tab2', 1)).toBe(initial)
  })
})
