import { hostHomes } from '@/content/css'

export const resolveServiceFromUrl = (url: string | undefined | null): string | null => {
  if (!url) return null
  try {
    const { host } = new URL(url)
    return hostHomes[host] || null
  } catch {
    return null
  }
}

export const todayKey = (date = new Date()): string => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export const isLimitableUrl = (url: string | undefined | null): boolean => {
  if (!url) return false
  // We only track usage for actual websites, not internal nora:// pages or blank tabs.
  return url.startsWith('http://') || url.startsWith('https://')
}

export const formatMinutes = (minutes: number): string => {
  const m = Math.max(0, Math.floor(minutes))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`
}
