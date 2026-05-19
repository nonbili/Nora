import { useEffect, useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import * as Clipboard from 'expo-clipboard'
import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import { useValue } from '@legendapp/state/react'
import { t } from 'i18next'
import { BaseCenterModal } from './BaseCenterModal'
import { NouButton } from '../button/NouButton'
import { NouText } from '../NouText'
import { nIf } from '@/lib/utils'
import {
  sanitizeHostGlobs,
  type CustomUserStyle,
  builtinUserStyleDefinitionById,
  type BuiltinUserStyleId,
} from '@/lib/user-styles'
import { userStyles$ } from '@/states/user-styles'
import { showToast } from '@/lib/toast'
import { ui$ } from '@/states/ui'
import { executeWebviewJavaScriptQuietly } from '@/lib/webview'

const textInputCls =
  'rounded-2xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-4 text-zinc-900 dark:text-white'
const secondaryActionCls =
  'h-10 flex-row items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3 active:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:active:bg-zinc-800'
const destructiveActionCls =
  'h-10 w-10 items-center justify-center rounded-xl border border-red-200 bg-red-50 active:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:active:bg-red-950/50'

type DraftState = {
  id: string | null
  name: string
  enabled: boolean
  hostGlobsText: string
  css: string
}

const formatHostGlobs = (hostGlobs: string[]) => hostGlobs.join(', ')

const cleanCss = (css: string) => {
  const lines = css
    .replace(/\/\*[\s\S]*?\*\/|([^:]|^)\/\/.*$/gm, '') // Remove comments
    .split('\n')
    .filter((line) => line.trim())

  if (lines.length === 0) return ''

  // Find the minimum indentation of the first line to strip it from all lines
  const firstLineIndent = lines[0].match(/^\s*/)?.[0].length || 0

  return lines.map((line) => line.slice(firstLineIndent)).join('\n')
}

const createDraft = (style?: CustomUserStyle | null): DraftState => {
  if (!style) {
    return {
      id: null,
      name: '',
      enabled: true,
      hostGlobsText: '',
      css: '',
    }
  }

  return {
    id: style.id,
    name: style.name,
    enabled: style.enabled,
    hostGlobsText: style.hostGlobs.join(', '),
    css: style.css,
  }
}

async function readPickedCss(result: DocumentPicker.DocumentPickerResult) {
  if (result.canceled) {
    return ''
  }

  const asset = result.assets?.[0] as (DocumentPicker.DocumentPickerAsset & { file?: File }) | undefined
  if (!asset) {
    return ''
  }

  if (asset.file && typeof asset.file.text === 'function') {
    return asset.file.text()
  }

  return new File(asset.uri).text()
}

export const UserStyleEditModal = ({ inline = false }: { inline?: boolean }) => {
  const open = useValue(ui$.userStyleModalOpen)
  const editingId = useValue(ui$.editingUserStyleId)
  const previewBuiltinId = useValue(ui$.previewBuiltinId)
  const webview = useValue(ui$.webview)
  const customStyles = useValue(userStyles$.customStyles)
  const [draft, setDraft] = useState<DraftState | null>(null)

  const previewDefinition = previewBuiltinId ? builtinUserStyleDefinitionById[previewBuiltinId as BuiltinUserStyleId] : null

  useEffect(() => {
    if (!open) {
      setDraft(null)
      return
    }

    if (editingId) {
      const style = customStyles.find((s) => s.id === editingId)
      setDraft(createDraft(style))
    } else {
      setDraft(createDraft())
    }
  }, [open, editingId, customStyles])

  const onClose = () => {
    ui$.userStyleModalOpen.set(false)
    ui$.editingUserStyleId.set(null)
    ui$.previewBuiltinId.set(null)
  }

  const onCopyBuiltinCss = async () => {
    if (!previewDefinition) {
      return
    }

    try {
      await Clipboard.setStringAsync(previewDefinition.css.trim())
      showToast(t('settings.userStyles.cssCopied'))
    } catch (error) {
      console.warn('[UserStyleEditModal] failed to copy css', error)
      showToast(t('settings.userStyles.copyFailed'))
    }
  }

  const onImportCss = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/css', 'text/plain'],
        copyToCacheDirectory: true,
        multiple: false,
      })
      const css = await readPickedCss(result)
      if (!css) {
        return
      }

      setDraft((value) => (value ? { ...value, css } : value))
    } catch (error) {
      console.warn('[UserStyleEditModal] failed to import css', error)
      showToast(t('settings.userStyles.importFailed'))
    }
  }

  const onPreviewCss = () => {
    if (!draft?.css.trim()) {
      showToast(t('settings.userStyles.validation.css'))
      return
    }

    if (!webview) {
      showToast(t('settings.userStyles.noActiveTab'))
      return
    }

    const script = `
      (() => {
        const id = '_nora_preview_css';
        let style = document.getElementById(id);
        if (!style) {
          style = document.createElement('style');
          style.id = id;
          (document.head || document.documentElement).appendChild(style);
        }
        style.textContent = ${JSON.stringify(draft.css)};
      })();
    `
    void executeWebviewJavaScriptQuietly(webview, script)
    showToast(t('settings.userStyles.previewApplied'))
  }

  const onDelete = () => {
    if (!draft?.id) {
      return
    }

    const deleteStyle = () => {
      userStyles$.deleteCustomStyle(draft.id!)
      onClose()
    }

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(t('settings.userStyles.deleteConfirm'))) {
        deleteStyle()
      }
      return
    }

    Alert.alert(t('menus.delete'), t('settings.userStyles.deleteConfirm'), [
      { text: t('buttons.cancel'), style: 'cancel' },
      {
        text: t('menus.delete'),
        style: 'destructive',
        onPress: deleteStyle,
      },
    ])
  }

  const onSave = () => {
    if (!draft) {
      return
    }

    const hostGlobs = sanitizeHostGlobs(draft.hostGlobsText.split(','))
    if (!hostGlobs.length) {
      showToast(t('settings.userStyles.validation.hostGlobs'))
      return
    }

    if (!draft.css.trim()) {
      showToast(t('settings.userStyles.validation.css'))
      return
    }

    const input = {
      name: draft.name.trim(),
      enabled: draft.enabled,
      hostGlobs,
      css: draft.css,
    }

    if (draft.id) {
      userStyles$.updateCustomStyle(draft.id, input)
    } else {
      userStyles$.addCustomStyle(input)
    }

    onClose()
  }

  if (previewDefinition) {
    return (
      <BaseCenterModal onClose={onClose} containerClassName="lg:w-[50rem] xl:w-[60rem] max-w-[95vw]">
        <View className="p-6">
          <View className="flex-row items-center gap-3">
            <View className="h-10 w-10 items-center justify-center rounded-xl bg-zinc-950">
              <MaterialIcons name="code" color="#818cf8" size={20} />
            </View>
            <View className="flex-1">
              <NouText className="text-lg font-bold">{t(previewDefinition.labelKey)}</NouText>
              <View className="mt-0.5 flex-row flex-wrap">
                <NouText className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  {formatHostGlobs(previewDefinition.hostGlobs)}
                </NouText>
              </View>
            </View>
          </View>

          <View className="mt-6 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
            <ScrollView className="max-h-[400px]" showsVerticalScrollIndicator={false}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="p-4 items-start">
                  <NouText
                    className="font-mono text-[11px] leading-5 text-indigo-300"
                    style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}
                  >
                    {cleanCss(previewDefinition.css)}
                  </NouText>
                </View>
              </ScrollView>
            </ScrollView>
          </View>

          <View className="mt-6 flex-row items-center justify-end gap-3">
            <NouButton size="1" variant="outline" onPress={onClose}>
              {t('buttons.cancel')}
            </NouButton>
            <Pressable
              onPress={onCopyBuiltinCss}
              className="flex-row items-center gap-2 rounded-full bg-indigo-600 px-6 py-2.5 active:bg-indigo-700"
            >
              <MaterialIcons name="content-copy" color="white" size={16} />
              <NouText className="text-sm font-bold text-white">{t('settings.userStyles.copyCss')}</NouText>
            </Pressable>
          </View>
        </View>
      </BaseCenterModal>
    )
  }

  if (!draft) {
    return null
  }

  const content = (
    <View className={inline ? 'pb-4' : 'p-6'}>
      <View className="flex-row items-center gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/10">
          <MaterialIcons name="auto-fix-high" color="#818cf8" size={20} />
        </View>
        <NouText className="text-xl font-bold tracking-tight">
          {draft.id ? t('settings.userStyles.editTitle') : t('settings.userStyles.addTitle')}
        </NouText>
      </View>

      <View className="mt-8">
        <NouText className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
          {t('settings.userStyles.nameLabel')}
        </NouText>
        <TextInput
          className={textInputCls}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(name) => setDraft((value) => (value ? { ...value, name } : value))}
          placeholder={t('settings.userStyles.namePlaceholder')}
          placeholderTextColor="#71717a"
          value={draft.name}
        />
      </View>

      <View className="mt-6">
        <NouText className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
          {t('settings.userStyles.hostGlobs.label')}
        </NouText>
        <TextInput
          className={textInputCls}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(hostGlobsText) => setDraft((value) => (value ? { ...value, hostGlobsText } : value))}
          placeholder={t('settings.userStyles.hostGlobs.placeholder')}
          placeholderTextColor="#71717a"
          value={draft.hostGlobsText}
        />
      </View>

      <View className="mt-6">
        <View className="mb-2 flex-row items-center justify-between gap-3 px-1">
          <NouText className="text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">CSS</NouText>
          <Pressable onPress={onPreviewCss} className="h-8 flex-row items-center gap-1.5 rounded-lg bg-indigo-600 px-3 active:bg-indigo-700">
            <MaterialIcons name="play-arrow" color="white" size={16} />
            <NouText className="text-xs font-semibold" style={{ color: 'white' }}>
              {t('settings.userStyles.preview')}
            </NouText>
          </Pressable>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="rounded-2xl border border-zinc-300 bg-white dark:border-zinc-800 dark:bg-zinc-950"
        >
          <TextInput
            className="min-h-[300px] p-4 text-xs text-zinc-900 dark:text-white"
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            onChangeText={(css) => setDraft((value) => (value ? { ...value, css } : value))}
            placeholder={`body {\n  font-size: 18px;\n}`}
            placeholderTextColor="#71717a"
            style={{
              textAlignVertical: 'top',
              fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
              minWidth: inline ? 420 : 800,
            }}
            value={draft.css}
          />
        </ScrollView>
      </View>

      <View className="mt-10 flex-row items-center justify-between gap-4">
        <View className="flex-row items-center gap-2">
          {nIf(
            draft.id,
            <Pressable onPress={onDelete} className={destructiveActionCls}>
              <MaterialIcons name="delete-outline" color="#ef4444" size={20} />
            </Pressable>,
          )}
        </View>
        <View className="flex-row items-center justify-end gap-2">
          <Pressable onPress={onImportCss} className={secondaryActionCls}>
            <MaterialIcons name="file-upload" color="#71717a" size={18} />
            <NouText className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
              {t('settings.userStyles.importCss')}
            </NouText>
          </Pressable>
          <NouButton size="1" onPress={onSave} className="h-10 items-center rounded-xl px-4">
            {t('common.save')}
          </NouButton>
        </View>
      </View>
    </View>
  )

  if (inline) {
    return content
  }

  return (
    <BaseCenterModal onClose={onClose} containerClassName="lg:w-[50rem] xl:w-[60rem] max-w-[95vw]">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} enabled={Platform.OS === 'ios'}>
        <ScrollView className="max-h-[80vh]">
          {content}
        </ScrollView>
      </KeyboardAvoidingView>
    </BaseCenterModal>
  )
}
