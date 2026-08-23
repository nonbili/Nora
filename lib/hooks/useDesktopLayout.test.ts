import { describe, expect, it } from 'bun:test'
import { shouldUseDesktopLayout } from './useDesktopLayout'

describe('shouldUseDesktopLayout', () => {
  it('keeps the phone layout in landscape, so rotation never remounts the tabs', () => {
    // iPhone 13 Pro Max: 428x926 portrait, 926x428 landscape.
    expect(shouldUseDesktopLayout(428, 926)).toBe(false)
    expect(shouldUseDesktopLayout(926, 428)).toBe(false)
    // A 1080p Android phone lands just past the width threshold in landscape.
    expect(shouldUseDesktopLayout(914, 411)).toBe(false)
  })

  it('uses the desktop workspace on a wide window with a tablet-sized short side', () => {
    expect(shouldUseDesktopLayout(1194, 834)).toBe(true)
    expect(shouldUseDesktopLayout(1920, 1080)).toBe(true)
  })

  it('keeps the phone layout in tablet portrait', () => {
    expect(shouldUseDesktopLayout(834, 1194)).toBe(false)
  })
})
