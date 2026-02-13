import { clsx, isIos, isWeb } from '@/lib/utils'
import { ReactNode } from 'react'
import { KeyboardAvoidingView, Pressable, ScrollView, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

export const BaseModal: React.FC<{ className?: string; children: ReactNode; onClose: () => void }> = ({
  className,
  children,
  onClose,
}) => {
  const insets = useSafeAreaInsets()

  const inner = isWeb ? children : <SafeAreaView className="max-h-full">{children}</SafeAreaView>

  return (
    <View className={clsx('absolute inset-0 z-10', className)}>
      <Pressable className="absolute inset-0 bg-gray-600/50" onPress={onClose} />
      <KeyboardAvoidingView
        behavior={isIos ? 'padding' : undefined}
        className="bg-gray-950 absolute top-0 left-0 bottom-0 w-[30rem] max-w-[80vw]"
      >
        {inner}
      </KeyboardAvoidingView>
    </View>
  )
}
