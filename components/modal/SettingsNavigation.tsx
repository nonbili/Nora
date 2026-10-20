import type { ReactNode } from 'react'

export type SettingsPage =
  | 'home'
  | 'browsing'
  | 'styles'
  | 'appearance'
  | 'services'
  | 'profiles'
  | 'bookmarks'
  | 'search'
  | 'sync'
  | 'backup'
  | 'about'
  | 'changelog'
  | 'usageLimits'

export interface SettingsNavigationProps {
  pageStack: SettingsPage[]
  titles: Record<SettingsPage, string>
  onPathChange: (path: SettingsPage[]) => void
  onClose: () => void
  renderPage: (page: SettingsPage) => ReactNode
}

export const SettingsNavigation = ({ renderPage }: SettingsNavigationProps) => <>{renderPage('home')}</>
