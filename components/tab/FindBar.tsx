import { useEffect, useRef } from 'react'
import { BackHandler, TextInput, View, type TextInputInstance } from 'react-native'
import { useValue } from '@legendapp/state/react'
import { t } from 'i18next'
import { ui$ } from '@/states/ui'
import { closeFindInPage, findInPage } from '@/lib/find-in-page'
import { useTwColor } from '@/lib/theme'
import { isWeb } from '@/lib/utils'
import { MaterialButton } from '../button/IconButtons'
import { NouText } from '../NouText'

const buttonStyle = { width: 36, height: 36 }

/** Finds text in the page of a tab, opened from its menu or with Ctrl/Cmd+F on the desktop. */
export const FindBar: React.FC<{ tabId: string }> = ({ tabId }) => {
  const tw = useTwColor()
  const find = useValue(ui$.findInPage)
  // Kept with the find, not here: a rotation can swap this bar for the other layout's.
  const text = find?.text || ''
  const inputRef = useRef<TextInputInstance>(null)

  // Opening it again, while it is open, goes back to the text.
  useEffect(() => {
    inputRef.current?.focus()
    // Again once a menu it was opened from has closed, and put focus back where it was.
    const timer = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(timer)
  }, [find?.openedAt])

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      closeFindInPage()
      return true
    })
    return () => subscription.remove()
  }, [])

  const onChangeText = (value: string) => {
    ui$.findInPage.text.set(value)
    findInPage(tabId, value)
  }
  const go = (forward: boolean) => text && findInPage(tabId, text, { next: true, forward })

  return (
    <View className="flex-row items-center gap-1 border-b border-zinc-200 bg-zinc-100 px-2 py-1 dark:border-zinc-800 dark:bg-zinc-800">
      <TextInput
        ref={inputRef}
        className="min-w-0 flex-1 rounded-md bg-white px-3 py-1.5 text-sm text-zinc-900 dark:bg-zinc-900 dark:text-white"
        value={text}
        onChangeText={onChangeText}
        placeholder={t('menus.findInPage')}
        placeholderTextColor={tw('#9ca3af')}
        autoFocus
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        submitBehavior="submit"
        // react-native-web knows only the older prop, and blurs on Enter without it.
        {...(isWeb ? ({ blurOnSubmit: false } as object) : {})}
        onSubmitEditing={() => go(true)}
        onKeyPress={(e) => {
          if (!isWeb) return
          const event = e.nativeEvent as unknown as KeyboardEvent
          if (event.key === 'Escape') {
            closeFindInPage()
          } else if (event.key === 'Enter' && event.shiftKey) {
            e.preventDefault()
            go(false)
          }
        }}
      />
      {text ? (
        <NouText className="px-1 text-xs text-zinc-500 dark:text-zinc-400">
          {find?.total ? t('menus.findMatches', { active: find.active, total: find.total }) : t('menus.findNoMatches')}
        </NouText>
      ) : null}
      <MaterialButton name="keyboard-arrow-up" size={22} accessibilityLabel={t('menus.findPrevious')} disabled={!text} onPress={() => go(false)} style={buttonStyle} />
      <MaterialButton name="keyboard-arrow-down" size={22} accessibilityLabel={t('menus.findNext')} disabled={!text} onPress={() => go(true)} style={buttonStyle} />
      <MaterialButton name="close" size={20} accessibilityLabel={t('menus.close')} onPress={closeFindInPage} style={buttonStyle} />
    </View>
  )
}
