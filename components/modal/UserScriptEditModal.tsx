import { useEffect, useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native'
import MaterialIcons from '@expo/vector-icons/MaterialIcons'
import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import { useValue } from '@legendapp/state/react'
import { t } from 'i18next'
import { BaseCenterModal } from './BaseCenterModal'
import { NouButton } from '../button/NouButton'
import { NouText } from '../NouText'
import { nIf } from '@/lib/utils'
import {
  parseUserscriptMetadata,
  sanitizeHostGlobs,
  stripUserscriptMetadata,
  type CustomUserScript,
} from '@/lib/user-styles'
import { userStyles$ } from '@/states/user-styles'
import { showToast } from '@/lib/toast'
import { ui$ } from '@/states/ui'
import { executeWebviewJavaScript } from '@/lib/webview'

const textInputCls =
  'rounded-2xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-4 text-zinc-900 dark:text-white'
const secondaryActionCls =
  'h-10 flex-row items-center gap-2 rounded-xl border border-zinc-300 bg-white px-3 active:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:active:bg-zinc-800'
const primaryActionCls = 'h-10 flex-row items-center gap-2 rounded-xl bg-indigo-600 px-4 active:bg-indigo-700'
const destructiveActionCls =
  'h-10 w-10 items-center justify-center rounded-xl border border-red-200 bg-red-50 active:bg-red-100 dark:border-red-900/60 dark:bg-red-950/30 dark:active:bg-red-950/50'

type DraftState = {
  id: string | null
  name: string
  enabled: boolean
  hostGlobsText: string
  js: string
}

const createDraft = (script?: CustomUserScript | null): DraftState => {
  if (!script) {
    return {
      id: null,
      name: '',
      enabled: true,
      hostGlobsText: '',
      js: '',
    }
  }

  return {
    id: script.id,
    name: script.name,
    enabled: script.enabled,
    hostGlobsText: script.hostGlobs.join(', '),
    js: script.js,
  }
}

async function readPickedScript(result: DocumentPicker.DocumentPickerResult) {
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

export const UserScriptEditModal = () => {
  const open = useValue(ui$.userScriptModalOpen)
  const editingId = useValue(ui$.editingUserScriptId)
  const webview = useValue(ui$.webview)
  const customScripts = useValue(userStyles$.customScripts)
  const [draft, setDraft] = useState<DraftState | null>(null)

  useEffect(() => {
    if (!open) {
      setDraft(null)
      return
    }

    if (editingId) {
      const script = customScripts.find((s) => s.id === editingId)
      setDraft(createDraft(script))
    } else {
      setDraft(createDraft())
    }
  }, [open, editingId, customScripts])

  const onClose = () => {
    ui$.userScriptModalOpen.set(false)
    ui$.editingUserScriptId.set(null)
  }

  const applyImportedScript = (source: string) => {
    const metadata = parseUserscriptMetadata(source)
    const js = stripUserscriptMetadata(source) || source

    setDraft((value) =>
      value
        ? {
            ...value,
            name: value.name || metadata.name,
            hostGlobsText: value.hostGlobsText || metadata.hostGlobs.join(', '),
            js,
          }
        : value,
    )
  }

  const onImportScript = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/javascript', 'application/javascript', 'text/plain'],
        copyToCacheDirectory: true,
        multiple: false,
      })
      const js = await readPickedScript(result)
      if (!js) {
        return
      }

      applyImportedScript(js)
    } catch (error) {
      console.warn('[UserScriptEditModal] failed to import script', error)
      showToast(t('settings.userStyles.scripts.importFailed'))
    }
  }

  const onRunScript = () => {
    if (!draft?.js.trim()) {
      showToast(t('settings.userStyles.scripts.validation.js'))
      return
    }

    if (!webview) {
      showToast(t('settings.userStyles.noActiveTab'))
      return
    }

    const script = `
      (() => {
        try {
          ${draft.js}
        } catch (error) {
          console.error('[Nora user script run]', error);
          throw error;
        }
      })();
    `
    void executeWebviewJavaScript(webview, script)
      .then(() => showToast(t('settings.userStyles.scripts.runComplete')))
      .catch(() => showToast(t('settings.userStyles.scripts.runFailed')))
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

    if (!draft.js.trim()) {
      showToast(t('settings.userStyles.scripts.validation.js'))
      return
    }

    const input = {
      name: draft.name.trim(),
      enabled: draft.enabled,
      hostGlobs,
      js: draft.js,
    }

    if (draft.id) {
      userStyles$.updateCustomScript(draft.id, input)
    } else {
      userStyles$.addCustomScript(input)
    }

    onClose()
  }

  if (!draft) {
    return null
  }

  return (
    <BaseCenterModal onClose={onClose} containerClassName="lg:w-[50rem] xl:w-[60rem] max-w-[95vw]">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} enabled={Platform.OS === 'ios'}>
        <ScrollView className="max-h-[80vh]">
          <View className="p-6">
            <View className="flex-row items-center gap-3">
              <View className="h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/10">
                <MaterialIcons name="code" color="#818cf8" size={20} />
              </View>
              <NouText className="text-xl font-bold tracking-tight">
                {draft.id ? t('settings.userStyles.scripts.editTitle') : t('settings.userStyles.scripts.addTitle')}
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
                placeholder={t('settings.userStyles.scripts.namePlaceholder')}
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
              <NouText className="mb-2 px-1 text-[11px] font-bold uppercase tracking-[0.2em] text-zinc-500">
                JavaScript
              </NouText>
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
                  onChangeText={(js) => setDraft((value) => (value ? { ...value, js } : value))}
                  placeholder={`document.body.dataset.nora = '1'`}
                  placeholderTextColor="#71717a"
                  style={{
                    textAlignVertical: 'top',
                    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                    minWidth: 800,
                  }}
                  value={draft.js}
                />
              </ScrollView>
            </View>

            <View className="mt-10 flex-row items-center justify-between gap-4">
              <View className="flex-row items-center gap-2">
                <NouButton size="1" variant="outline" onPress={onClose}>
                  {t('buttons.cancel')}
                </NouButton>
                {nIf(
                  draft.id,
                  <Pressable
                    onPress={() => {
                      Alert.alert(t('menus.delete'), t('settings.userStyles.scripts.deleteConfirm'), [
                        { text: t('buttons.cancel'), style: 'cancel' },
                        {
                          text: t('menus.delete'),
                          style: 'destructive',
                          onPress: () => {
                            userStyles$.deleteCustomScript(draft.id!)
                            onClose()
                          },
                        },
                      ])
                    }}
                    className={destructiveActionCls}
                  >
                    <MaterialIcons name="delete-outline" color="#ef4444" size={20} />
                  </Pressable>,
                )}
              </View>
              <View className="flex-row items-center justify-end gap-2">
                <Pressable
                  onPress={onImportScript}
                  className={secondaryActionCls}
                >
                  <MaterialIcons name="file-upload" color="#71717a" size={18} />
                  <NouText className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                    {t('settings.userStyles.scripts.import')}
                  </NouText>
                </Pressable>
                <Pressable
                  onPress={onRunScript}
                  className={primaryActionCls}
                >
                  <MaterialIcons name="play-arrow" color="white" size={18} />
                  <NouText className="text-sm font-semibold" style={{ color: 'white' }}>
                    {t('settings.userStyles.scripts.run')}
                  </NouText>
                </Pressable>
                <NouButton size="1" onPress={onSave} className="h-10 items-center rounded-xl px-4">
                  {t('common.save')}
                </NouButton>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </BaseCenterModal>
  )
}
