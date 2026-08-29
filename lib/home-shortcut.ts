import { Platform } from 'react-native'
import { t } from 'i18next'
import NoraViewModule from '@/modules/nora-view'
import { showToast } from '@/lib/toast'
import { getUserAgent } from '@/lib/useragent'
import type { Tab } from '@/states/tabs'

const getHost = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

// Only Android exposes a way to pin a shortcut from inside the app; iOS has no API for
// it, and the desktop build has no launcher to pin to.
export function canPinTabToHomeScreen(tab: Pick<Tab, 'url'>) {
  if (Platform.OS !== 'android' || !tab.url) {
    return false
  }
  try {
    return NoraViewModule.isPinShortcutSupported?.() ?? false
  } catch {
    return false
  }
}

export async function pinTabToHomeScreen(tab: Pick<Tab, 'id' | 'url' | 'title' | 'icon' | 'manifest' | 'profile' | 'desktopMode'>) {
  if (!tab.url) {
    return
  }

  const label = tab.title?.trim() || getHost(tab.url) || tab.url
  try {
    const pinned = await NoraViewModule.pinTabShortcut?.(
      tab.id,
      tab.url,
      label,
      tab.icon ?? null,
      tab.manifest ?? null,
      tab.profile || 'default',
      getUserAgent('android', tab.desktopMode),
    )
    // A launcher can refuse the request outright (some OEM launchers do), and the system
    // dialog itself is not confirmed here -- so only report the request being accepted.
    if (!pinned) {
      showToast(t('toast.addToHomeScreenFailed'))
    }
  } catch (e) {
    console.error(e)
    showToast(t('toast.addToHomeScreenFailed'))
  }
}
