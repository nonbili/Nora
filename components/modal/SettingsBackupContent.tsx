import { useState } from 'react'
import { ActivityIndicator, Pressable, View, useColorScheme } from 'react-native'
import * as DocumentPicker from 'expo-document-picker'
import { t } from 'i18next'
import MaterialIcons, { type MaterialIconsIconName } from '@react-native-vector-icons/material-icons'
import { NouText } from '../NouText'
import { SettingsSection, SettingsSurface, settingsUi } from './SettingsPrimitives'
import { clsx } from '@/lib/utils'
import { colors } from '@/lib/colors'
import { showToast } from '@/lib/toast'
import { confirmAction, confirmDestructiveAction } from '@/lib/confirm'
import { saveFile } from '@/lib/file'
import {
  applySettingsBackup,
  countEnabledCustomScripts,
  exportSettingsJson,
  parseSettingsBackup,
  settingsBackupFilename,
} from '@/lib/settings-transfer'

const SettingsActionRow: React.FC<{
  label: string
  description?: string
  icon: MaterialIconsIconName
  onPress: () => void
  isLast?: boolean
  loading?: boolean
  disabled?: boolean
}> = ({ label, description, icon, onPress, isLast = false, loading = false, disabled = false }) => {
  const colorScheme = useColorScheme()
  const isDark = colorScheme !== 'light'
  const isDisabled = disabled || loading
  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={clsx(
        'flex-row items-center gap-3 px-4 py-4 active:bg-zinc-200/80 dark:active:bg-zinc-800/80',
        isDisabled && 'opacity-70',
        !isLast && settingsUi.rowBorderCls,
      )}
    >
      <View className={settingsUi.iconWrapCls}>
        <MaterialIcons name={icon} color={isDark ? colors.icon : colors.iconLightStrong} size={18} />
      </View>
      <View className="flex-1">
        <NouText>{label}</NouText>
        {description ? (
          <NouText className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-400">{description}</NouText>
        ) : null}
      </View>
      {loading ? (
        <ActivityIndicator color={isDark ? colors.icon : colors.iconLightStrong} />
      ) : (
        <MaterialIcons name="chevron-right" color={isDark ? '#71717a' : '#52525b'} size={20} />
      )}
    </Pressable>
  )
}

export const SettingsBackupContent = () => {
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)

  const onExport = async () => {
    if (exporting) {
      return
    }

    setExporting(true)
    try {
      await saveFile(settingsBackupFilename(), exportSettingsJson())
    } catch (e) {
      console.error('[SettingsBackup] export failed', e)
      showToast(t('settings.backup.exportFailed', { message: (e as Error).message }))
    } finally {
      setExporting(false)
    }
  }

  const onImport = async () => {
    if (importing) {
      return
    }

    // Some pickers report JSON as a generic type, so accept text/* as well.
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ['application/json', 'text/*'],
    })
    const asset = result.assets?.[0]
    if (!asset) {
      return
    }

    setImporting(true)
    try {
      const response = await fetch(asset.uri)
      const text = await response.text()
      const backup = parseSettingsBackup(text)
      const enabledScripts = countEnabledCustomScripts(backup)
      const apply = () => {
        const restored = applySettingsBackup(backup)
        showToast(t('settings.backup.importDone', { sections: restored.join(', ') }))
      }

      if (enabledScripts > 0) {
        confirmDestructiveAction(
          t('settings.backup.import'),
          t('settings.backup.importWithScriptsConfirm', { count: enabledScripts }),
          t('buttons.continue'),
          apply,
        )
      } else {
        confirmAction(t('settings.backup.import'), t('settings.backup.importConfirm'), t('buttons.continue'), apply)
      }
    } catch (e) {
      console.error('[SettingsBackup] import failed', e)
      showToast(t('settings.backup.importFailed', { message: (e as Error).message }))
    } finally {
      setImporting(false)
    }
  }

  return (
    <View className="gap-6 pb-4">
      <SettingsSection label={t('settings.backup.export')}>
        <SettingsSurface>
          <SettingsActionRow
            label={t('settings.backup.export')}
            description={t('settings.backup.exportDescription')}
            icon="upload-file"
            loading={exporting}
            onPress={() => {
              void onExport()
            }}
            isLast
          />
        </SettingsSurface>
      </SettingsSection>

      <SettingsSection label={t('settings.backup.import')}>
        <SettingsSurface>
          <SettingsActionRow
            label={t('settings.backup.import')}
            description={t('settings.backup.importDescription')}
            icon="settings-backup-restore"
            loading={importing}
            onPress={() => {
              void onImport()
            }}
            isLast
          />
        </SettingsSurface>
      </SettingsSection>
    </View>
  )
}
