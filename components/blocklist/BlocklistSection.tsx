import { refreshBlocklist, supportsRuntimeBlocklist } from '@/lib/blocklist'
import { shouldAutoRefresh } from '@/lib/blocklist/policy'
import { showToast } from '@/lib/toast'
import { blocklist$ } from '@/states/blocklist'
import { useValue } from '@legendapp/state/react'
import { t } from 'i18next'
import { View } from 'react-native'
import { clsx } from '@/lib/utils'
import { NouButton } from '../button/NouButton'
import { NouText } from '../NouText'
import { NouSwitch } from '../switch/NouSwitch'

function formatTimestamp(timestamp?: number) {
  if (!timestamp) {
    return null
  }
  try {
    return new Date(timestamp).toLocaleString()
  } catch {
    return null
  }
}

export const BlocklistSection: React.FC<{ hideTitle?: boolean; hideRefreshAction?: boolean }> = ({
  hideTitle = false,
  hideRefreshAction = false,
}) => {
  const blocklist = useValue(blocklist$)

  if (!supportsRuntimeBlocklist()) {
    return null
  }

  const hasSnapshot = blocklist.hasSnapshot
  const loading = blocklist.phase === 'fetching'
  const lastUpdated = formatTimestamp(blocklist.lastUpdatedAt)
  const lastUpdatedText = lastUpdated
    ? t('blocklist.lastUpdated', { value: lastUpdated, interpolation: { escapeValue: false } })
    : null
  const initialFetchText = blocklist.enabled && !hasSnapshot && loading ? t('blocklist.statusFetching') : null
  const showRefreshAction = !hideRefreshAction
  const updateBlocklist = async (showSuccessToast = false) => {
    const refreshed = await refreshBlocklist({ manual: true })
    if (refreshed && showSuccessToast) {
      showToast(t('toast.blocklistUpdated'))
    }
  }

  const onToggle = async () => {
    if (blocklist.enabled) {
      blocklist$.setEnabled(false)
      return
    }

    blocklist$.setEnabled(true)
    if (!hasSnapshot && !loading) {
      void updateBlocklist(false)
    }
  }

  return (
    <View className={clsx(!hideTitle && 'mt-2 mb-9')}>
      <NouSwitch
        className="mb-2"
        label={<NouText>{hideTitle ? t('blocklist.enable') : t('blocklist.label')}</NouText>}
        value={blocklist.enabled}
        onPress={onToggle}
      />
      <NouText className="text-sm text-gray-400 mb-4">{t('blocklist.description')}</NouText>
      {initialFetchText ? <NouText className="text-sm text-gray-400 mb-3">{initialFetchText}</NouText> : null}
      {blocklist.lastError ? <NouText className="text-sm text-red-400 mt-2">{blocklist.lastError}</NouText> : null}
      {
        <>
          <View className="items-end">
            {blocklist.enabled && showRefreshAction ? (
              <NouButton
                size="1"
                variant="outline"
                loading={loading}
                disabled={loading}
                onPress={() => void updateBlocklist(true)}
              >
                {t('blocklist.refreshNow')}
              </NouButton>
            ) : null}
            {blocklist.enabled && lastUpdatedText ? (
              <NouText className="text-sm text-gray-400 mt-1 text-right">{lastUpdatedText}</NouText>
            ) : null}
          </View>
        </>
      }
    </View>
  )
}
