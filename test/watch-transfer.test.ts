import { describe, expect, test } from 'bun:test'
import { exportSourcesOpml, parseSourceList, type WatchBackup } from '@/lib/watch-transfer'
import { watchKey } from '@/lib/watch'

describe('source list export', () => {
  test('preserves Mastodon handles when saved profile URLs use another host or path', () => {
    const profiles: WatchBackup['profiles'] = [
      { site: 'mastodon', handle: 'alice@example.com', url: 'https://social.example.com/@alice' },
      { site: 'mastodon', handle: 'bob@akkoma.example', url: 'https://akkoma.example/users/bob' },
      { site: 'mastodon', handle: 'carol@pixelfed.example', url: 'https://pixelfed.example/carol' },
    ]
    const imported = parseSourceList(exportSourcesOpml({ profiles, timelines: [] }))
    expect(imported.unrecognized).toBe(0)
    expect(imported.profiles.map(watchKey)).toEqual(profiles.map(watchKey))
  })

  test('skips folders of unsupported feeds while preserving truly empty folders', () => {
    const imported = parseSourceList(`<opml><body>
      <outline text="Blogs"><outline text="News"><outline xmlUrl="https://example.com/feed.xml" /></outline></outline>
      <outline text="Space"><outline htmlUrl="https://www.reddit.com/r/space/" /></outline>
      <outline text="Empty" />
    </body></opml>`)
    expect(imported.timelines.map((timeline) => timeline.name).sort()).toEqual(['Empty', 'Space'])
    expect(imported.profiles).toEqual([{ site: 'reddit', handle: 'r/space', timeline: 'Space' }])
    expect(imported.unrecognized).toBe(1)
    const unsupported = parseSourceList('<opml><body><outline text="Blogs"><outline xmlUrl="https://example.com/feed.xml" /></outline></body></opml>')
    expect(unsupported.timelines).toEqual([])
    expect(unsupported.profiles).toEqual([])
  })

  test('preserves empty timelines, including a file with no sources', () => {
    const backup: WatchBackup = { profiles: [], timelines: [{ name: 'Empty & quiet' }] }
    const imported = parseSourceList(exportSourcesOpml(backup))
    expect(imported.profiles).toEqual([])
    expect(imported.timelines).toEqual(backup.timelines)
    expect(imported.unrecognized).toBe(0)
    expect(parseSourceList('<opml><body><outline text="Empty" /></body></opml>').timelines).toEqual([{ name: 'Empty' }])
  })

  test('imports exported sources from every site with timeline membership intact', () => {
    const name = 'Space & science <news> "日本語"'
    const backup: WatchBackup = {
      timelines: [{ name }],
      profiles: [
        { site: 'x', handle: 'NASA', name: 'NASA & "space" <news>', timeline: name },
        { site: 'instagram', handle: 'nasa', timeline: name },
        { site: 'threads', handle: 'nasa', timeline: name },
        { site: 'bluesky', handle: 'nasa.gov', timeline: name },
        { site: 'mastodon', handle: 'nasa@mastodon.social', timeline: name },
        { site: 'reddit', handle: 'r/space' },
        { site: 'facebook', handle: 'NASA' },
        { site: 'tiktok', handle: 'nasa' },
      ],
    }
    const xml = exportSourcesOpml(backup)
    const imported = parseSourceList(xml)
    expect(imported.unrecognized).toBe(0)
    expect(imported.profiles.map(watchKey).sort()).toEqual(backup.profiles.map(watchKey).sort())
    for (const profile of backup.profiles) {
      expect(imported.profiles.find((current) => watchKey(current) === watchKey(profile))?.timeline).toBe(profile.timeline)
    }
    expect(imported.timelines).toEqual([{ name }])
    expect(xml).toContain('NASA &amp; &quot;space&quot; &lt;news&gt;')
  })

  test('exports source links without device settings or post data', () => {
    const xml = exportSourcesOpml({
      feedNotify: true,
      timelines: [{ name: 'Space', notify: true, checkIntervalMinutes: 60 }],
      profiles: [{ site: 'facebook', handle: '12345', timeline: 'Space', notify: true, checkIntervalMinutes: 30 }],
    })
    expect(xml).toContain('https://www.facebook.com/profile.php?id=12345')
    expect(xml).not.toContain('notify')
    expect(xml).not.toContain('checkIntervalMinutes')
    expect(parseSourceList(xml).profiles).toEqual([{ site: 'facebook', handle: '12345', timeline: 'Space' }])
    expect(parseSourceList(exportSourcesOpml({ profiles: [], timelines: [] })).profiles).toEqual([])
  })
})
