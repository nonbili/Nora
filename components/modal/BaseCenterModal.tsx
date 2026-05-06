import { clsx, isIos, isWeb } from '@/lib/utils'
import { ReactNode, useEffect, useState } from 'react'
import { Keyboard, KeyboardAvoidingView, Modal, Pressable, View } from 'react-native'

export const BaseCenterModal: React.FC<{ className?: string; containerClassName?: string; children: ReactNode; onClose: () => void }> = ({
  className,
  containerClassName,
  children,
  onClose,
}) => {
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

  const innerCls = clsx('rounded-lg bg-zinc-100 dark:bg-gray-950 w-[30rem] lg:w-[40rem] xl:w-[50rem] max-w-[80vw]', containerClassName)

  const body = (
    <View className={clsx('absolute inset-0 z-10 items-center justify-center', className)}>
      <Pressable className="absolute inset-0 bg-zinc-300/80 dark:bg-gray-600/80" onPress={handleBackdropPress} />
      <KeyboardAvoidingView behavior={isIos ? 'padding' : 'height'} pointerEvents="box-none">
        <View className={innerCls}>{children}</View>
      </KeyboardAvoidingView>
    </View>
  )

  if (isWeb) {
    return body
  }

  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      {body}
    </Modal>
  )
}
