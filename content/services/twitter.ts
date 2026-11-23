import { BaseService, type InterceptedRequest, type TransformOptions } from './base'
import { Instruction, Tweet, TweetEntry, TwitterResponse } from './twitter/types'

function transformInstructions(instructions: Instruction[], blockAds = true) {
  return instructions.map((instruction) => {
    if (blockAds && instruction.type == 'TimelineAddEntries') {
      instruction.entries = instruction.entries.filter(
        (x) =>
          !x.entryId.includes('promoted') &&
          ('items' in x.content ? !x.content.items[0].entryId.includes('promoted') : true),
      )
    }
    return instruction
  })
}

const re1 = new RegExp(
  'https://(x.com/i/api|api.x.com)/graphql/[\\w-]+/(HomeTimeline|HomeLatestTimeline|SearchTimeline|TweetDetail|UserTweets|TweetResultByRestId)',
)

const homeTimelineRe = /\/graphql\/[\w-]+\/(HomeTimeline|HomeLatestTimeline)(?:\?|$)/

const getRequestVariables = ({ url, body }: InterceptedRequest): Record<string, unknown> | null => {
  try {
    if (typeof body === 'string' && body) {
      return JSON.parse(body).variables ?? null
    }
    const variables = new URL(url).searchParams.get('variables')
    return variables ? JSON.parse(variables) : null
  } catch {
    return null
  }
}

/**
 * The home feeds return posts the client already holds in later pages, under the same
 * entryId. X's timeline store keys entries by entryId, so a repeat moves the post it already
 * rendered down to the new page's position: a post the user just saw vanishes from between
 * its neighbours. Dropping repeats keeps every rendered post where it is.
 */
export class HomeTimelineDeduper {
  /** Per timeline: entryId -> the cursors of requests that delivered it, and its last sent children. */
  private delivered = new Map<string, Map<string, { cursors: Set<string>; children: string[] }>>()

  apply(instructions: Instruction[], request: InterceptedRequest) {
    const timeline = request.url.match(homeTimelineRe)?.[1]
    if (!timeline) {
      return instructions
    }
    // A request without a cursor loads the timeline from scratch, and X rebuilds its store.
    const cursor = String(getRequestVariables(request)?.cursor ?? '')
    let seen = this.delivered.get(timeline)
    if (!seen || !cursor) {
      seen = new Map()
      this.delivered.set(timeline, seen)
    }
    for (const instruction of instructions) {
      if (instruction.type === 'TimelineClearCache') {
        seen.clear()
        continue
      }
      if (instruction.type !== 'TimelineAddEntries') {
        continue
      }
      instruction.entries = instruction.entries.filter((entry) => {
        const children = 'items' in entry.content ? entry.content.items.map((item) => item.entryId) : []
        // Only organic posts and conversations. Promoted entries (or modules holding one) are
        // left to the ad filter, so ads-off responses keep them as X sent them.
        if (
          !/^(tweet|home-conversation)-/.test(entry.entryId) ||
          entry.entryId.includes('promoted') ||
          children.some((id) => id.includes('promoted'))
        ) {
          return true
        }
        const previous = seen.get(entry.entryId)
        // A retried page (same cursor) gets its entries back, since X may have discarded the
        // first response. A conversation that differs from the version last sent is kept, so a
        // new or returning reply isn't lost.
        if (previous && !previous.cursors.has(cursor) && children.every((id) => previous.children.includes(id))) {
          return false
        }
        seen.set(entry.entryId, { cursors: new Set([...(previous?.cursors || []), cursor]), children })
        return true
      })
    }
    return instructions
  }
}

export class TwitterService extends BaseService {
  private homeDeduper = new HomeTimelineDeduper()

  shouldIntercept(url: string) {
    return re1.test(url)
  }

  transformResponse(res: string, request: InterceptedRequest, { blockAds }: TransformOptions) {
    // With ads allowed only the home feeds are touched, so skip parsing anything else.
    if (!blockAds && !homeTimelineRe.test(request.url)) {
      return res
    }
    const data = JSON.parse(res) as TwitterResponse
    const { home, search_by_raw_query, threaded_conversation_with_injections_v2, user, tweetResult } = data.data
    if (home) {
      home.home_timeline_urt.instructions = this.homeDeduper.apply(
        transformInstructions(home.home_timeline_urt.instructions, blockAds),
        request,
      )
      if (!blockAds) {
        return JSON.stringify(data)
      }
      // const before = data.data.home.home_timeline_urt.instructions[0].entries
      // const after = before.filter((x) => !x.entryId.startsWith('promoted'))
      // data.data.home.home_timeline_urt.instructions[0].entries = after
    } else if (search_by_raw_query) {
      search_by_raw_query.search_timeline.timeline.instructions = transformInstructions(
        search_by_raw_query.search_timeline.timeline.instructions,
      )
    } else if (threaded_conversation_with_injections_v2) {
      const { instructions } = threaded_conversation_with_injections_v2
      threaded_conversation_with_injections_v2.instructions = transformInstructions(instructions)
      // if (url.includes('TweetDetail') && url.includes('focalTweetId')) {
      //   for (const instruction of instructions) {
      //     if (instruction.type == 'TimelineAddEntries') {
      //       const entry = instruction.entries[0] as TweetEntry
      //       const { itemContent } = entry.content
      //       const result = itemContent?.tweet_results.result as Tweet
      //       const media = result?.legacy.entities.media || []
      //       for (const entity of media) {
      //         const variants = entity.video_info?.variants || []
      //         this.videoUrl = variants.at(-1)?.url
      //         break
      //       }
      //     }
      //   }
      // }
    } else if (user) {
      user.result.timeline.timeline.instructions = transformInstructions(user.result.timeline.timeline.instructions)
    } else if (tweetResult) {
      const media = tweetResult.result.legacy.entities.media || []
      for (const entity of media) {
        const variants = entity.video_info?.variants || []
        this.videoUrl = variants.at(-1)?.url
        break
      }
    }

    return JSON.stringify(data)
  }
}
