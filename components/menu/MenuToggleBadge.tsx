import { Text, View } from 'react-native'
import { t } from 'i18next'
import { clsx } from '@/lib/utils'

export const MenuToggleBadge: React.FC<{ on: boolean }> = ({ on }) => (
  <View
    className={clsx(
      'rounded-full px-2 py-1',
      on
        ? 'bg-indigo-100 border border-indigo-300 dark:bg-indigo-500/20 dark:border-indigo-400/40'
        : 'bg-zinc-200 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700',
    )}
  >
    <Text
      className={clsx(
        'text-[11px] font-medium',
        on ? 'text-indigo-700 dark:text-indigo-200' : 'text-zinc-600 dark:text-zinc-400',
      )}
    >
      {on ? t('common.on') : t('common.off')}
    </Text>
  </View>
)
