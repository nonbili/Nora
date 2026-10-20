import { useMemo } from 'react'
import { useValue } from '@legendapp/state/react'
import { watchPostsVersion$ } from '@/lib/watch-db'

/** What a query of the kept posts gives, read again only when the posts or what it asks change. */
export const useWatchPosts = <T>(query: () => T, key?: unknown): T => {
  const version = useValue(watchPostsVersion$)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => query(), [version, key])
}
