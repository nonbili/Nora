import { View } from 'react-native'
import { NouText } from '../NouText'
import { siteIcon } from '../service/Services'
import { watchSiteLabels, type WatchSite } from '@/lib/watch'
import { clsx } from '@/lib/utils'

/** The sites whose profiles can be watched, each with its icon and name. */
export const WatchSites: React.FC<{ compact?: boolean; className?: string }> = ({ compact, className }) => (
  <View className={clsx('flex-row flex-wrap justify-center', compact ? 'gap-x-1 gap-y-3' : 'gap-x-4 gap-y-4', className)}>
    {(Object.keys(watchSiteLabels) as WatchSite[]).map((site) => (
      <View key={site} className={clsx('items-center gap-1.5', compact ? 'w-16' : 'w-20')}>
        <View className={clsx('items-center justify-center rounded-2xl bg-white dark:bg-zinc-800', compact ? 'h-10 w-10' : 'h-12 w-12')}>{siteIcon(site)}</View>
        <NouText className="text-xs text-zinc-600 dark:text-zinc-400" numberOfLines={1}>
          {watchSiteLabels[site]}
        </NouText>
      </View>
    ))}
  </View>
)
