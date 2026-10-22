import { Appearance } from 'react-native'
import { File, Paths } from 'expo-file-system'
import { createMMKV } from 'react-native-mmkv'
import { mediaKey, type WatchPost, type WatchSite } from '@/lib/watch'
import { setProfilePosts } from '@/lib/watch-db'
import { mediaFileUri } from '@/lib/watch-media-files'
import { watchMedia$ } from '@/lib/watch-media'
import { autoProfiles$ } from '@/states/auto-profiles'
import { blocklist$ } from '@/states/blocklist'
import { bookmarks$ } from '@/states/bookmarks'
import { settings$ } from '@/states/settings'
import { tabGroups$ } from '@/states/tab-groups'
import { tabs$ } from '@/states/tabs'
import { ui$ } from '@/states/ui'
import { userStyles$ } from '@/states/user-styles'
import { watch$ } from '@/states/watch'
import fixture from '../fastlane/videos/assets/native-preview-fixture.json'

interface PreviewStateOverride {
  theme?: 'dark' | 'light'
  activeTabId?: string
  feedMediaOnly?: boolean
  sourcesScreen?: boolean
  tabModalOpen?: boolean
  settingsModalOpen?: boolean
  feedSettingsModalOpen?: boolean
  feedGallery?: boolean
  activeGroupId?: string | null
  desktopLayout?: 'auto' | 'on' | 'off'
}

function readPreviewOverride(): PreviewStateOverride {
  try {
    const file = new File(Paths.document, 'preview-state.json')
    if (file.exists) {
      return JSON.parse(file.textSync()) as PreviewStateOverride
    }
  } catch (e) {
    console.warn('[preview] failed to read preview-state.json', e)
  }
  return {}
}

function seedAppPreviewData() {
  const now = Date.now()
  const override = readPreviewOverride()
  const mmkv = createMMKV()
  mmkv.clearAll()

  const theme = override.theme ?? 'dark'
  Appearance.setColorScheme(theme)
  settings$.assign({
    theme,
    feedEnabled: true,
    oneProfilePerSite: true,
    oneTabPerSite: true,
    pullToRefresh: true,
    videoEdgeLongPressTo2x: true,
    videoDefaultSpeed: 1.25,
    desktopLayout: override.desktopLayout ?? 'auto',
    deckTabWidth: 440,
    profiles: fixture.profiles,
  })

  autoProfiles$.profiles.set(
    fixture.autoProfiles.map((item) => ({
      id: item.id,
      site: item.site,
      createdAt: now + item.createdAtOffsetMs,
      lastUsedAt: now + item.lastUsedAtOffsetMs,
    })),
  )

  bookmarks$.bookmarks.set(fixture.bookmarks)

  const watchedProfiles = fixture.watchedProfiles.map((profile, idx) => ({
    key: profile.key,
    site: profile.site as WatchSite,
    handle: profile.handle,
    name: profile.name,
    avatar: mediaFileUri(profile.avatarFile),
    addedAt: now - (fixture.watchedProfiles.length - idx) * 86_400_000,
    timelineId: profile.timelineId,
    mode: profile.mode as 'loggedIn' | 'loggedOut',
    accountProfileId: profile.accountProfileId,
    notify: profile.notify,
    seenAt: now + (profile.seenOffsetMs ?? -7_200_000),
    lastCheckedAt: now - 120_000,
    lastSuccessAt: now - 120_000,
  }))

  watch$.assign({
    profiles: watchedProfiles,
    feedSeenAt: now - 14_400_000,
    timelines: fixture.timelines,
    feedPinned: true,
    feedEmoji: '📰',
    checkIntervalMinutes: 60,
    mediaWifiOnly: true,
    mediaLimitMB: 1024,
    postsPerSource: 100,
    sourcesSort: 'updated',
    sourcesSortReversed: false,
    useAccounts: true,
    accountProfiles: {
      x: 'personal',
      instagram: 'creator',
      reddit: 'work',
      bluesky: 'default',
    },
    feedMediaOnly: override.feedMediaOnly ?? false,
    timelineNotify: { 'tl-design': true, 'tl-tech': true },
    feedNotify: true,
    loginHintDismissedSites: ['x', 'instagram', 'threads', 'bluesky', 'mastodon', 'reddit', 'facebook', 'tiktok'],
  })

  const postsByProfile: Record<string, WatchPost[]> = {}
  const keptFiles: Record<string, { name: string; bytes: number; postCreatedAt: number; usedAt: number }> = {}
  const anchorPostKey = fixture.posts[0]?.key ?? 'bluesky:lena.studio:post-101'

  fixture.watchedProfiles.forEach((profile, idx) => {
    keptFiles[mediaKey(anchorPostKey, 90 + idx)] = {
      name: profile.avatarFile,
      bytes: 24_576,
      postCreatedAt: now,
      usedAt: now,
    }
  })

  for (const rawPost of fixture.posts) {
    const createdAtMs = now + rawPost.createdOffsetMs
    const firstSeenAt = now + rawPost.firstSeenOffsetMs
    const media = (rawPost.mediaFiles || []).map((item, idx) => {
      const localUri = mediaFileUri(item.file)
      keptFiles[mediaKey(rawPost.key, idx)] = {
        name: item.file,
        bytes: 184_320,
        postCreatedAt: createdAtMs,
        usedAt: now - 60_000,
      }
      return {
        type: 'image' as const,
        url: localUri,
        thumb: localUri,
        width: item.width,
        height: item.height,
      }
    })

    const post: WatchPost = {
      key: rawPost.key,
      id: rawPost.id,
      site: rawPost.site as WatchSite,
      handle: rawPost.handle,
      url: rawPost.url,
      text: rawPost.text,
      image: media[0]?.url,
      media,
      mediaComplete: true,
      createdAtMs,
      firstSeenAt,
      ...(rawPost.quote
        ? {
            quote: {
              handle: rawPost.quote.handle,
              name: rawPost.quote.name,
              avatar: mediaFileUri(rawPost.quote.avatarFile),
              url: rawPost.quote.url,
              text: rawPost.quote.text,
              createdAtMs: now + rawPost.quote.createdOffsetMs,
            },
          }
        : {}),
    }

    if (!postsByProfile[rawPost.profileKey]) {
      postsByProfile[rawPost.profileKey] = []
    }
    postsByProfile[rawPost.profileKey].push(post)
  }

  for (const profile of watchedProfiles) {
    setProfilePosts(profile.key, postsByProfile[profile.key] || [])
  }

  watchMedia$.files.set(keptFiles)

  userStyles$.assign({
    builtins: {
      'hide-x-home-tabs': { enabled: true },
      'hide-instagram-open-app-banner': { enabled: true },
      'hide-reddit-open-app-banner': { enabled: true },
      'hide-threads-open-app-banner': { enabled: true },
    },
    builtinScripts: {
      'enter-as-shift-enter': { enabled: true },
    },
    customStyles: fixture.customStyles,
    customScripts: fixture.customScripts,
  })

  blocklist$.assign({
    enabled: true,
    phase: 'ready',
    hasSnapshot: true,
    lastUpdatedAt: now - 300_000,
    lastError: undefined,
    excludedHosts: [],
    revision: 14,
  })

  const allTabs = [
    {
      id: 'tab-home',
      url: '',
      title: 'New Tab',
      profile: 'default',
    },
    ...fixture.tabs,
  ]

  const targetTabId = override.activeTabId ?? 'tab-home'
  const activeIdx = Math.max(0, allTabs.findIndex((t) => t.id === targetTabId))
  const orders = Object.fromEntries(allTabs.map((t, index) => [t.id, index]))

  tabs$.assign({
    tabs: allTabs,
    activeTabIndex: activeIdx,
    orders,
    recentlyClosedTabs: fixture.recentlyClosedTabs.map((closed) => ({
      id: closed.id,
      url: closed.url,
      title: closed.title,
      profile: closed.profile,
      closedAt: now + closed.closedAtOffsetMs,
    })),
  })

  const groups = [
    {
      id: 'group-deck',
      name: 'Feed Deck',
      layout: 'deck' as const,
      tabIds: ['tab-feed-all', 'tab-feed-design'],
    },
    {
      id: 'group-split',
      name: 'Studio Split',
      layout: 'split' as const,
      tabIds: ['tab-feed-design', 'tab-feed-visuals'],
    },
  ]

  tabGroups$.assign({
    groups,
    activeGroupId: override.activeGroupId !== undefined ? override.activeGroupId : null,
    sidebarOrder: ['tab:tab-home', 'group:group-deck', 'group:group-split', 'tab:tab-bsky', 'tab:tab-github', 'tab:tab-x'],
  })

  ui$.assign({
    sourcesScreen: override.sourcesScreen ? { tabId: targetTabId } : null,
    tabModalOpen: false,
    settingsModalOpen: false,
    feedSettingsModalOpen: false,
    feedGallery: null,
  })

  if (override.tabModalOpen || override.settingsModalOpen || override.feedSettingsModalOpen || override.feedGallery) {
    setTimeout(() => {
      ui$.assign({
        tabModalOpen: Boolean(override.tabModalOpen),
        settingsModalOpen: Boolean(override.settingsModalOpen),
        feedSettingsModalOpen: Boolean(override.feedSettingsModalOpen),
        feedGallery: override.feedGallery
          ? {
              postKey: 'bluesky:lena.studio:post-101',
              profileKey: 'bluesky:lena.studio',
              index: 0,
            }
          : null,
      })
    }, 650)
  }
}

if (process.env.EXPO_PUBLIC_APP_PREVIEW === '1') {
  seedAppPreviewData()
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('expo-router/entry')
