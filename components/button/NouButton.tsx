import { clsx, nIf } from '@/lib/utils'
import { NouText, textColorsIn } from '../NouText'
import { ActivityIndicator, TouchableOpacity } from 'react-native'
import { useTwColor } from '@/lib/theme'

export const NouButton = ({
  className,
  textClassName,
  variant = 'solid',
  size = '2',
  loading = false,
  children,
  onPress,
  disabled,
}: React.PropsWithChildren<{
  className?: string
  textClassName?: string
  variant?: 'solid' | 'soft' | 'outline'
  size?: '1' | '2'
  loading?: boolean
  disabled?: boolean
  onPress: () => void
}>) => {
  const tw = useTwColor()
  const isDisabled = Boolean(disabled || loading)
  const spinnerColor = variant === 'solid' ? '#ffffff' : variant === 'soft' ? tw('#4338ca') : tw('#475569')
  // As in NouText, a color the caller sets has to replace the variant's: either would win by stylesheet order.
  const { hasColor, hasDarkColor } = textColorsIn(textClassName)

  return (
    <TouchableOpacity
      className={clsx(
        'flex-row gap-2 justify-center rounded-full',
        size === '1' && 'py-1 px-3',
        size === '2' && 'py-2 px-6',
        variant === 'solid' && !isDisabled && 'bg-indigo-600 dark:bg-indigo-500',
        variant === 'soft' && !isDisabled && 'bg-indigo-100 dark:bg-zinc-800',
        variant === 'outline' && !isDisabled && 'border border-zinc-300 dark:border-zinc-700 bg-transparent',
        variant === 'solid' && isDisabled && 'bg-zinc-300 dark:bg-zinc-700',
        variant === 'soft' && isDisabled && 'bg-zinc-200 dark:bg-zinc-800/80',
        variant === 'outline' && isDisabled && 'border border-zinc-200 dark:border-zinc-800 bg-transparent',
        className,
      )}
      disabled={isDisabled}
      onPress={() => (isDisabled ? {} : onPress())}
    >
      {nIf(loading, <ActivityIndicator color={spinnerColor} />)}
      <NouText
        className={clsx(
          variant === 'solid' && !isDisabled && !hasColor && 'text-white',
          variant === 'soft' && !isDisabled && !hasColor && 'text-indigo-700',
          variant === 'soft' && !isDisabled && !hasDarkColor && 'dark:text-zinc-100',
          variant === 'outline' && !isDisabled && !hasColor && 'text-zinc-700',
          variant === 'outline' && !isDisabled && !hasDarkColor && 'dark:text-zinc-200',
          isDisabled && 'text-zinc-500 dark:text-zinc-400',
          textClassName,
        )}
        style={variant === 'solid' && !isDisabled && !hasColor ? { color: '#ffffff' } : undefined}
      >
        {children}
      </NouText>
    </TouchableOpacity>
  )
}
