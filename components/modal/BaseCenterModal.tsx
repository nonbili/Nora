import { clsx, isIos, isWeb } from '@/lib/utils'
import { ReactNode, useEffect, useState } from 'react'
import { Keyboard, KeyboardAvoidingView, Modal, Pressable, View } from 'react-native'
import { createPortal } from 'react-dom'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export const BaseCenterModal: React.FC<{
  className?: string
  keyboardAvoidingClassName?: string
  containerClassName?: string
  align?: 'center' | 'top' | 'keyboard'
  children: ReactNode
  onClose: () => void
}> = ({
  className,
  keyboardAvoidingClassName,
  containerClassName,
  align = 'keyboard',
  children,
  onClose,
}) => {
  const insets = useSafeAreaInsets()
  const [keyboardVisible, setKeyboardVisible] = useState(false)

  useEffect(() => {
    if (isWeb) {
      return
    }

    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true))
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false))

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

  const innerCls = clsx('rounded-lg bg-zinc-100 dark:bg-gray-950 w-[30rem] lg:w-[40rem] xl:w-[50rem] max-w-[80vw]', containerClassName)

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
        <View className={innerCls}>{children}</View>
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
