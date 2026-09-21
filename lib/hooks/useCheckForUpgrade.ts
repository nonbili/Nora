import { useEffect, useRef, useState } from 'react'
import { Linking } from 'react-native'
import { t } from 'i18next'
import { version } from '../../desktop/package.json'
import { MAIN_CHANNEL } from '../../desktop/src/main/ipc/constants'
import { confirmAction } from '@/lib/confirm'
import { showToast } from '@/lib/toast'
import { isNewerVersion, parseStableVersion } from '@/lib/upgrade'
import { isWeb } from '@/lib/utils'

export function useCheckForUpgrade() {
  const [checking, setChecking] = useState(false)
  const pending = useRef(false)
  const [supported, setSupported] = useState(false)

  useEffect(() => {
    if (!isWeb) return
    let cancelled = false
    void window.electron?.ipcRenderer.invoke(MAIN_CHANNEL, 'supportsUpdateChecks')
      .then((value) => {
        if (!cancelled) setSupported(value === true)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const checkForUpgrade = async () => {
    if (!supported || pending.current) return
    pending.current = true
    setChecking(true)
    try {
      if (!parseStableVersion(version)) throw new Error('Invalid installed version')
      // GitHub's latest endpoint excludes drafts and prereleases. Check afresh,
      // including for portable builds without an auto-updater.
      const response = await window.electron.ipcRenderer.invoke(
        MAIN_CHANNEL, 'fetchText',
        'https://api.github.com/repos/nonbili/Nora-Desktop/releases/latest',
        { accept: 'application/vnd.github+json' },
      )
      if (response?.status !== 200) throw new Error('Failed to check for upgrades')
      const release = JSON.parse(response.body)
      if (typeof release.tag_name !== 'string' || !parseStableVersion(release.tag_name)) {
        throw new Error('Invalid release version')
      }
      if (isNewerVersion(release.tag_name, version)) {
        confirmAction(
          t('upgrade.check'),
          t('upgrade.available', { version: release.tag_name }),
          t('upgrade.download'),
          () => {
            void Linking.openURL(`https://github.com/nonbili/Nora-Desktop/releases/tag/${encodeURIComponent(release.tag_name)}`)
              .catch(() => showToast(t('upgrade.failed')))
          },
        )
      } else {
        showToast(t('upgrade.upToDate', { version }))
      }
    } catch {
      showToast(t('upgrade.failed'))
    } finally {
      pending.current = false
      setChecking(false)
    }
  }

  return { checking, checkForUpgrade, supported }
}
