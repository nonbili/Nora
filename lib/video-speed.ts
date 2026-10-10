/** What the default speed can be set to. */
export const videoSpeeds = [1, 1.25, 1.5, 1.75, 2, 2.5, 3]

/** What a long press offers; kept short so each one is an easy slide apart. */
export const videoLongPressSpeeds = [1, 1.5, 2, 3]

export const normalizeVideoSpeed = (value: unknown) =>
  typeof value === 'number' && videoSpeeds.includes(value) ? value : 1
