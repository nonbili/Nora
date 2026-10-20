import { clsx, isAndroid, isIos, isWeb } from '@/lib/utils'
import { ReactNode, useEffect, useState } from 'react'
import { Keyboard, KeyboardAvoidingView, Modal, Pressable, View, useWindowDimensions } from 'react-native'
import { createPortal } from 'react-dom'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export const BaseCenterModal: React.FC<{
  className?: string
  keyboardAvoidingClassName?: string
  containerClassName?: string
  align?: 'center' | 'top' | 'keyboard'
  children: ReactNode
  onClose: () => void
}> = ({ className, keyboardAvoidingClassName, containerClassName, align = 'keyboard', children, onClose }) => {
  const insets = useSafeAreaInsets()
  const { height, width } = useWindowDimensions()
  const [keyboardVisible, setKeyboardVisible] = useState(false)
  // Where the keyboard starts, from the top of the screen; none while it is hidden.
  const [keyboardTop, setKeyboardTop] = useState<number | null>(null)

  useEffect(() => {
    if (isWeb) {
      return
    }

    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardVisible(true)
      setKeyboardTop(e.endCoordinates.screenY)
    })
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardVisible(false)
      setKeyboardTop(null)
    })

    return () => {
      showSub.remove()
      hideSub.remove()
    }
  }, [])

  const handleBackdropPress = () => {
    if (!isWeb && keyboardVisible) {
      Keyboard.dismiss()
      return
    }
    onClose()
  }

  const topAligned = align === 'top' || (align === 'keyboard' && keyboardVisible)

  const innerCls = clsx(
    'rounded-2xl bg-zinc-100 dark:bg-gray-950 w-[30rem] lg:w-[40rem] xl:w-[50rem]',
    !isAndroid && 'max-w-[80vw]',
    containerClassName,
  )

  const body = (
    <View
      className={clsx('absolute inset-0 z-10 items-center', topAligned ? 'justify-start' : 'justify-center', className)}
      style={topAligned ? { paddingTop: insets.top + 12 } : undefined}
    >
      <Pressable className="absolute inset-0 bg-zinc-300/80 dark:bg-gray-600/80" onPress={handleBackdropPress} />
      <KeyboardAvoidingView
        behavior={isIos ? 'padding' : 'height'}
        pointerEvents="box-none"
        className={keyboardAvoidingClassName}
      >
        {/* No taller than what the screen shows above the keyboard; a dialog lets its list shrink to fit. */}
        <View className={innerCls} style={{ maxHeight: (keyboardTop ?? height - insets.bottom) - insets.top - 24, ...(isAndroid ? { maxWidth: width - 48 } : {}) }}>
          {children}
        </View>
      </KeyboardAvoidingView>
    </View>
  )

  if (isWeb) {
    return createPortal(body, document.body)
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      {body}
    </Modal>
  )
}
