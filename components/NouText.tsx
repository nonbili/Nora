import { Text, type TextProps } from 'react-native'
import { clsx } from '@/lib/utils'

// NativeWind resolves conflicting utilities by stylesheet order, not by the order
// they appear in the className string, so the base color below would always beat a
// caller-supplied one. Drop the base whenever the caller sets its own text color.
const isTextColor = (cls: string) =>
  /^text-(?:\[|inherit$|current$|transparent$|black$|white$)/.test(cls) || /^text-[a-z]+-\d{2,3}(?:\/\d+)?$/.test(cls)

export const NouText: React.FC<TextProps> = ({ className, ...rest }) => {
  const classes = className?.split(/\s+/).filter(Boolean) ?? []
  const hasColor = classes.some((cls) => !cls.includes(':') && isTextColor(cls))
  const hasDarkColor = classes.some((cls) => cls.startsWith('dark:') && isTextColor(cls.slice(5)))
  return <Text className={clsx(!hasColor && 'text-zinc-900', !hasDarkColor && 'dark:text-gray-100', className)} {...rest} />
}
