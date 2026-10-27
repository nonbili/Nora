import { describe, expect, it } from 'bun:test'
import { backgroundIntervalMinutes, dueWatchProfiles, splitInterval, watchIntervalMinutes } from './schedule'

describe('watchIntervalMinutes', () => {
  it('is the choice of the profile, or else the one for all', () => {
    expect(watchIntervalMinutes({ checkIntervalMinutes: 15 }, 60)).toBe(15)
    expect(watchIntervalMinutes({}, 60)).toBe(60)
  })

  it('is the choice of its timeline when the profile has none of its own', () => {
    const timelines = { news: 30, art: undefined }
    expect(watchIntervalMinutes({ timelineId: 'news' }, 60, timelines)).toBe(30)
    expect(watchIntervalMinutes({ timelineId: 'news', checkIntervalMinutes: 15 }, 60, timelines)).toBe(15)
    expect(watchIntervalMinutes({ timelineId: 'art' }, 60, timelines)).toBe(60)
    expect(watchIntervalMinutes({ timelineId: 'gone' }, 60, timelines)).toBe(60)
  })
})

describe('backgroundIntervalMinutes', () => {
  it('is that of the profile checked most often', () => {
    expect(backgroundIntervalMinutes([{}, { checkIntervalMinutes: 30 }, { checkIntervalMinutes: 1440 }], 60)).toBe(30)
    expect(backgroundIntervalMinutes([{}], 180)).toBe(180)
  })

  it('is never shorter than the system allows', () => {
    expect(backgroundIntervalMinutes([{ checkIntervalMinutes: 5 }], 60)).toBe(15)
  })
})

describe('dueWatchProfiles', () => {
  const now = 10 * 60 * 60 * 1000
  const profiles = [
    { key: 'x:fresh', lastCheckedAt: now - 10 * 1000 },
    { key: 'x:recent', lastCheckedAt: now - 5 * 60 * 1000 },
    { key: 'x:old', lastCheckedAt: now - 2 * 60 * 60 * 1000 },
    { key: 'x:waiting', lastCheckedAt: now - 3 * 60 * 60 * 1000, retryAfter: now + 60 * 1000 },
    { key: 'x:new' },
  ]
  const keysOf = (list: { key: string }[]) => list.map((profile) => profile.key)

  it('checks on its own only those whose interval is up and the site does not hold back', () => {
    expect(keysOf(dueWatchProfiles(profiles, { manual: false, now, defaultMinutes: 60 }))).toEqual(['x:new', 'x:old'])
  })

  it('checks by hand all but those just checked, the oldest first', () => {
    expect(keysOf(dueWatchProfiles(profiles, { manual: true, now, defaultMinutes: 60 }))).toEqual([
      'x:new',
      'x:waiting',
      'x:old',
      'x:recent',
    ])
  })

  it('checks only the profiles asked for', () => {
    const keys = ['x:recent', 'x:fresh']
    expect(keysOf(dueWatchProfiles(profiles, { manual: true, keys, now, defaultMinutes: 60 }))).toEqual(['x:recent'])
    expect(dueWatchProfiles(profiles, { manual: false, keys, now, defaultMinutes: 60 })).toEqual([])
  })

  it('checks by hand, when forced, even those just checked', () => {
    expect(keysOf(dueWatchProfiles(profiles, { manual: true, keys: ['x:fresh'], now, defaultMinutes: 60, force: true }))).toEqual(['x:fresh'])
  })

  it('waits as long as the timeline of a profile chose', () => {
    const inNews = [{ key: 'x:old', timelineId: 'news', lastCheckedAt: now - 2 * 60 * 60 * 1000 }]
    expect(dueWatchProfiles(inNews, { manual: false, now, defaultMinutes: 60, timelineMinutes: { news: 180 } })).toEqual([])
  })
})

describe('splitInterval', () => {
  it('uses the largest whole unit', () => {
    expect(splitInterval(30)).toEqual({ unit: 'minutes', count: 30 })
    expect(splitInterval(180)).toEqual({ unit: 'hours', count: 3 })
    expect(splitInterval(1440)).toEqual({ unit: 'days', count: 1 })
    expect(splitInterval(90)).toEqual({ unit: 'minutes', count: 90 })
  })
})
