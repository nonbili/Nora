import * as Clipboard from 'expo-clipboard'
import { useValue } from '@legendapp/state/react'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Dimensions, Modal, Pressable, View } from 'react-native'
import MaterialIcons from '@react-native-vector-icons/material-icons'
import NoraViewModule from '@/modules/nora-view'
import { ui$ } from '@/states/ui'
import { NouText } from '@/components/NouText'
import { t } from 'i18next'

export const TranslationCard = () => {
  const request = useValue(ui$.translation)
  const [result, setResult] = useState<{ text: string; sourceLanguage?: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!request) {
      setResult(null)
      setError(null)
      return
    }
    let cancelled = false
    setResult(null)
    setError(null)
    void NoraViewModule.translateText(request.text, request.targetLanguage)
      .then((value) => {
        if (!cancelled && ui$.translation.get()?.id === request.id) setResult(value)
      })
      .catch((cause) => {
        if (!cancelled && ui$.translation.get()?.id === request.id) {
          const message = String((cause as Error)?.message || cause)
          setError(message.includes('unavailable') ? t('settings.translation.unsupported') : t('settings.translation.failed'))
        }
      })
    return () => { cancelled = true }
  }, [request])

  if (!request) return null
  const { height, width } = Dimensions.get('window')
  const top = Math.min(Math.max(request.y + 8, 56), height - 260)
  const left = Math.min(Math.max(request.x, 12), Math.max(12, width - 332))
  const close = () => ui$.translation.set(null)

  return (
    <Modal transparent visible animationType="fade" onRequestClose={close}>
      <Pressable className="flex-1" onPress={close}>
        <Pressable
          className="absolute w-80 rounded-2xl border border-zinc-300 bg-zinc-50 p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
          style={{ top, left }}
          onPress={(event) => event.stopPropagation()}
        >
          <View className="flex-row items-center justify-between gap-2">
            <NouText className="text-sm font-semibold">{result?.sourceLanguage ? `${result.sourceLanguage} → ${request.targetLanguage}` : t('settings.translation.loading')}</NouText>
            <Pressable accessibilityRole="button" accessibilityLabel={t('buttons.cancel')} onPress={close}>
              <MaterialIcons name="close" size={20} color="#71717a" />
            </Pressable>
          </View>
          {result ? <NouText className="mt-3 text-base leading-6">{result.text}</NouText> : error ? <NouText className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</NouText> : <ActivityIndicator className="mt-5 mb-2" />}
          {result ? (
            <Pressable
              className="mt-4 self-start rounded-full bg-indigo-600 px-3 py-2"
              onPress={() => void Clipboard.setStringAsync(result.text)}
            >
              <NouText className="text-xs font-semibold text-white">{t('settings.translation.copy')}</NouText>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  )
}
