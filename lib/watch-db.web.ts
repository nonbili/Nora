import { observable } from '@legendapp/state'
import type { WatchPost } from '@/lib/watch'

// The feed is not on the web, so no posts are kept there.

export const watchPostsVersion$ = observable(0)

export const getProfilePosts = (_profileKey: string): WatchPost[] => []
export const setProfilePosts = (_profileKey: string, _posts: WatchPost[]) => {}
export const deleteProfilePosts = (_profileKey: string) => {}
export const trimWatchPosts = (_max: number) => {}
export const importWatchPosts = (_byProfile: Record<string, WatchPost[] | undefined>) => {}
export const findWatchPost = (_profileKey: string, _key: string): WatchPost | undefined => undefined
export const updateWatchPost = (_profileKey: string, _key: string, _patch: Partial<WatchPost>) => {}
export const getFeedPosts = (_profileKeys: string[], _limit: number): WatchPost[] => []
export const getUnreadPostKeys = (
  _profileKeys: string[],
  _seenAtByProfile: Record<string, number>,
  _defaultSeenAt: number,
): Set<string> => new Set()
export const getProfilesWithPosts = (_keys: Iterable<string>, _seenAfter: number): Set<string> => new Set()
export const getNewestPostTimes = (): Record<string, number> => ({})
export const getWatchPostKeys = (): Set<string> => new Set()
export const getPostsNewestFirst = (_limit: number, _offset: number): WatchPost[] => []
