import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { inheritedInterval, notifyChoice, timelineIntervals, watch$ } from './watch'
import { watchIntervalMinutes } from '@/lib/watch'

const reset = () => {
  watch$.profiles.set([])
  watch$.timelines.set([])
  watch$.timelineNotify.set({})
  watch$.feedNotify.set(false)
  watch$.checkIntervalMinutes.set(60)
}

describe('source setting inheritance', () => {
  beforeEach(reset)
  afterEach(reset)

  test('uses global notifications even in a timeline without its own choice', () => {
    const timelineId = watch$.createTimeline('Space', [])
    for (const notify of [false, true]) {
      watch$.feedNotify.set(notify)
      expect(notifyChoice({})).toEqual({ notify, from: 'feed' })
      expect(notifyChoice({ timelineId })).toEqual({ notify, from: 'feed' })
    }
  })

  test('uses timeline notifications, including an explicit Off over global On', () => {
    const timelineId = watch$.createTimeline('Space', [])
    watch$.feedNotify.set(true)
    watch$.setTimelineNotify(timelineId, false)
    expect(notifyChoice({ timelineId })).toMatchObject({ notify: false, from: 'timeline', timeline: { name: 'Space' } })
    watch$.setTimelineNotify(timelineId, true)
    expect(notifyChoice({ timelineId })).toMatchObject({ notify: true, from: 'timeline' })
    watch$.setTimelineNotify(timelineId, undefined)
    expect(notifyChoice({ timelineId })).toEqual({ notify: true, from: 'feed' })
  })

  test('keeps source overrides independent while the inherited option follows timeline changes', () => {
    const timelineId = watch$.createTimeline('Space', [])
    watch$.setTimelineNotify(timelineId, true)
    expect(notifyChoice({ timelineId, notify: false })).toEqual({ notify: false, from: 'source' })
    expect(notifyChoice({ timelineId })).toMatchObject({ notify: true, from: 'timeline' })
    watch$.setTimelineNotify(timelineId, false)
    expect(notifyChoice({ timelineId, notify: true })).toEqual({ notify: true, from: 'source' })
    expect(notifyChoice({ timelineId })).toMatchObject({ notify: false, from: 'timeline' })
  })

  test('inherits the global interval until a timeline chooses its own', () => {
    const timelineId = watch$.createTimeline('Space', [])
    expect(inheritedInterval({ timelineId })).toEqual({ minutes: 60, timeline: undefined })
    watch$.updateTimeline(timelineId, { checkIntervalMinutes: 30 })
    expect(inheritedInterval({ timelineId })).toMatchObject({ minutes: 30, timeline: { name: 'Space' } })
    expect(watchIntervalMinutes({ timelineId, checkIntervalMinutes: 15 }, 60, timelineIntervals())).toBe(15)
    expect(watchIntervalMinutes({ timelineId }, 60, timelineIntervals())).toBe(30)
    watch$.updateTimeline(timelineId, { checkIntervalMinutes: undefined })
    expect(inheritedInterval({ timelineId })).toEqual({ minutes: 60, timeline: undefined })
  })

  test('falls back to global settings when a timeline has been removed', () => {
    const timelineId = watch$.createTimeline('Space', [])
    watch$.setTimelineNotify(timelineId, true)
    watch$.updateTimeline(timelineId, { checkIntervalMinutes: 30 })
    watch$.deleteTimeline(timelineId)
    expect(notifyChoice({ timelineId })).toEqual({ notify: false, from: 'feed' })
    expect(inheritedInterval({ timelineId })).toEqual({ minutes: 60, timeline: undefined })
    expect(watchIntervalMinutes({ timelineId }, 60, timelineIntervals())).toBe(60)
  })
})
