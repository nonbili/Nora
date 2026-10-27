/** The choices for how often a profile is checked, in minutes. */
export const WATCH_INTERVAL_OPTIONS = [15, 30, 60, 180, 360, 720, 1440]

export const DEFAULT_WATCH_INTERVAL_MINUTES = 60

// The system does not run a background task more often than this.
export const MIN_BACKGROUND_INTERVAL_MINUTES = 15

interface IntervalProfile {
  timelineId?: string
  checkIntervalMinutes?: number
}

/** The interval each timeline chose, by its id; a timeline without one is not there. */
export type TimelineIntervals = Record<string, number | undefined>

/** How often a profile is checked: its own choice, or else its timeline's, or else the one for all. */
export const watchIntervalMinutes = (profile: IntervalProfile, defaultMinutes: number, timelineMinutes: TimelineIntervals = {}) =>
  profile.checkIntervalMinutes || (profile.timelineId && timelineMinutes[profile.timelineId]) || defaultMinutes

/** How often the background task has to run for the profile checked most often. */
export const backgroundIntervalMinutes = (profiles: IntervalProfile[], defaultMinutes: number, timelineMinutes: TimelineIntervals = {}) =>
  Math.max(
    MIN_BACKGROUND_INTERVAL_MINUTES,
    Math.min(...profiles.map((profile) => watchIntervalMinutes(profile, defaultMinutes, timelineMinutes))),
  )

// A refresh by hand does not ask again for a profile checked this recently, however often it is tapped.
export const MANUAL_REFRESH_COOLDOWN_MS = 30 * 1000

interface DueProfile extends IntervalProfile {
  key: string
  lastCheckedAt?: number
  retryAfter?: number
}

/**
 * The profiles a run checks, the ones checked longest ago first: by hand, all of those asked
 * for (all when none are named) unless just checked; otherwise those whose interval is up.
 */
export function dueWatchProfiles<T extends DueProfile>(
  profiles: T[],
  {
    manual,
    keys,
    now,
    defaultMinutes,
    timelineMinutes,
    force,
  }: { manual: boolean; keys?: string[]; now: number; defaultMinutes: number; timelineMinutes?: TimelineIntervals; force?: boolean },
): T[] {
  return (
    profiles
      .filter((profile) => !keys || keys.includes(profile.key))
      // A refresh by hand tries again even a profile the site asked to wait with.
      .filter((profile) => manual || !profile.retryAfter || profile.retryAfter <= now)
      .filter((profile) => {
        if (!profile.lastCheckedAt) return true
        const since = now - profile.lastCheckedAt
        // Unless forced, as just after imginn's check was passed for profiles it stopped.
        return manual ? force || since >= MANUAL_REFRESH_COOLDOWN_MS : since >= watchIntervalMinutes(profile, defaultMinutes, timelineMinutes) * 60000
      })
      .sort((a, b) => (a.lastCheckedAt || 0) - (b.lastCheckedAt || 0))
  )
}

/** An interval as the largest unit it is a whole number of. */
export function splitInterval(minutes: number): { unit: 'minutes' | 'hours' | 'days'; count: number } {
  if (minutes % 1440 === 0) return { unit: 'days', count: minutes / 1440 }
  if (minutes % 60 === 0) return { unit: 'hours', count: minutes / 60 }
  return { unit: 'minutes', count: minutes }
}
