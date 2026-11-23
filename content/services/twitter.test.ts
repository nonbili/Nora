import { expect, test } from 'bun:test'
import { TwitterService } from './twitter'

const url = 'https://x.com/i/api/graphql/abc/HomeTimeline'
const page = (ids: string[]) =>
  JSON.stringify({
    data: {
      home: {
        home_timeline_urt: {
          instructions: [{ type: 'TimelineAddEntries', entries: ids.map((entryId) => ({ entryId, sortIndex: '1', content: {} })) }],
        },
      },
    },
  })
const ids = (res: string) => JSON.parse(res).data.home.home_timeline_urt.instructions[0].entries.map((e: any) => e.entryId)
const body = (cursor?: string) => JSON.stringify({ variables: { count: 20, ...(cursor ? { cursor } : {}) } })

test('home feed drops posts already delivered, so X does not move rendered posts', () => {
  const service = new TwitterService()
  const opts = { blockAds: true }
  expect(ids(service.transformResponse(page(['tweet-1', 'promoted-tweet-9', 'tweet-2', 'cursor-bottom-1']), { url, body: body() }, opts)))
    .toEqual(['tweet-1', 'tweet-2', 'cursor-bottom-1'])
  expect(ids(service.transformResponse(page(['tweet-2', 'tweet-3', 'cursor-bottom-1']), { url, body: body('c1') }, opts)))
    .toEqual(['tweet-3', 'cursor-bottom-1'])
  // A fresh load (no cursor) starts over.
  expect(ids(service.transformResponse(page(['tweet-1', 'tweet-2']), { url, body: body() }, opts))).toEqual(['tweet-1', 'tweet-2'])
})

test('feed de-duplication still applies with ad blocking off, promoted posts stay', () => {
  const service = new TwitterService()
  const opts = { blockAds: false }
  service.transformResponse(page(['tweet-1', 'promoted-tweet-9', 'tweet-promoted-8']), { url, body: body() }, opts)
  expect(ids(service.transformResponse(page(['tweet-1', 'promoted-tweet-9', 'tweet-promoted-8']), { url, body: body('c1') }, opts)))
    .toEqual(['promoted-tweet-9', 'tweet-promoted-8'])
})

test('timelines are tracked separately and read GET variables', () => {
  const service = new TwitterService()
  const opts = { blockAds: true }
  const latest = 'https://x.com/i/api/graphql/abc/HomeLatestTimeline'
  service.transformResponse(page(['tweet-1']), { url, body: body() }, opts)
  expect(ids(service.transformResponse(page(['tweet-1']), { url: `${latest}?variables=${encodeURIComponent('{}')}` }, opts))).toEqual(['tweet-1'])
  expect(ids(service.transformResponse(page(['tweet-1']), { url: `${latest}?variables=${encodeURIComponent('{"cursor":"x"}')}` }, opts))).toEqual([])
})

test('TimelineClearCache resets delivered posts', () => {
  const service = new TwitterService()
  const opts = { blockAds: true }
  service.transformResponse(page(['tweet-1']), { url, body: body() }, opts)
  const res = JSON.parse(page(['tweet-1']))
  res.data.home.home_timeline_urt.instructions.unshift({ type: 'TimelineClearCache' })
  const out = JSON.parse(service.transformResponse(JSON.stringify(res), { url, body: body('c1') }, opts))
  expect(out.data.home.home_timeline_urt.instructions[1].entries.map((e: any) => e.entryId)).toEqual(['tweet-1'])
})

test('modules with a promoted item and non-post entries are not deduplicated', () => {
  const service = new TwitterService()
  const opts = { blockAds: false }
  const mod = (id: string) => JSON.stringify({ data: { home: { home_timeline_urt: { instructions: [{ type: 'TimelineAddEntries', entries: [
    { entryId: id, content: { items: [{ entryId: `${id}-promoted-tweet-1` }] } },
    { entryId: 'who-to-follow-1', content: {} },
  ] }] } } } })
  service.transformResponse(mod('home-conversation-1'), { url, body: body() }, opts)
  expect(ids(service.transformResponse(mod('home-conversation-1'), { url, body: body('c1') }, opts)))
    .toEqual(['home-conversation-1', 'who-to-follow-1'])
})

test('a retried cursor gets its own posts back; conversations with new replies are kept', () => {
  const service = new TwitterService()
  const opts = { blockAds: true }
  service.transformResponse(page(['tweet-1']), { url, body: body() }, opts)
  expect(ids(service.transformResponse(page(['tweet-1', 'tweet-2']), { url, body: body('c1') }, opts))).toEqual(['tweet-2'])
  expect(ids(service.transformResponse(page(['tweet-1', 'tweet-2']), { url, body: body('c1') }, opts))).toEqual(['tweet-2'])
  const convo = (children: string[]) => JSON.stringify({ data: { home: { home_timeline_urt: { instructions: [{ type: 'TimelineAddEntries', entries: [
    { entryId: 'home-conversation-5', content: { items: children.map((entryId) => ({ entryId })) } },
  ] }] } } } })
  service.transformResponse(convo(['a', 'b']), { url, body: body('c2') }, opts)
  expect(ids(service.transformResponse(convo(['a', 'b']), { url, body: body('c3') }, opts))).toEqual([])
  expect(ids(service.transformResponse(convo(['a', 'b', 'c']), { url, body: body('c4') }, opts))).toEqual(['home-conversation-5'])
  // Retrying the page that sent the update replays it; a reply that returns is kept.
  expect(ids(service.transformResponse(convo(['a', 'b', 'c']), { url, body: body('c4') }, opts))).toEqual(['home-conversation-5'])
  service.transformResponse(convo(['a', 'd']), { url, body: body('c5') }, opts)
  expect(ids(service.transformResponse(convo(['a', 'b', 'd']), { url, body: body('c6') }, opts))).toEqual(['home-conversation-5'])
})
