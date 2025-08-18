import { BaseService } from './base'

interface TwitterTimelineEntry {
  // tweet-<id> | promoted-tweet-id
  entryId: string
  content: {
    entryType: 'TimelineTimelineModule'
    __typename: 'TimelineTimelineModule'
    items?: {
      // conversationthread-id-promoted-tweet-id
      entryId: string
    }[]
  }
}

type TwitterTimelineInstruction =
  | { type: 'TimelineClearCache' }
  | {
      type: 'TimelineAddEntries'
      entries: TwitterTimelineEntry[]
    }
  | { type: 'TimelineTerminateTimeline' }

interface TwitterTimeline {
  data: {
    // HomeTimeline | HomeLatestTimeline
    home?: {
      home_timeline_urt: {
        instructions: TwitterTimelineInstruction[]
      }
    }
    // SearchTimeline
    search_by_raw_query?: {
      search_timeline: {
        timeline: {
          instructions: TwitterTimelineInstruction[]
        }
      }
    }
    // TweetDetail
    threaded_conversation_with_injections_v2?: {
      instructions: TwitterTimelineInstruction[]
    }
    // UserTweets
    user?: {
      result: {
        timeline: {
          timeline: {
            instructions: TwitterTimelineInstruction[]
          }
        }
      }
    }
  }
}

function transformInstructions(instructions: TwitterTimelineInstruction[]) {
  return instructions.map((instruction) => {
    if (instruction.type == 'TimelineAddEntries') {
      instruction.entries = instruction.entries.filter(
        (x) => !x.entryId.includes('promoted') && !x.content.items?.[0].entryId.includes('promoted'),
      )
    }
    return instruction
  })
}

const re1 = new RegExp(
  'https://x.com/i/api/graphql/[\\w-]+/(HomeTimeline|HomeLatestTimeline|SearchTimeline|TweetDetail|UserTweets)',
)

export class TwitterService extends BaseService {
  shouldIntercept(url: string) {
    return re1.test(url)
  }

  transformResponse(res: string) {
    const data = JSON.parse(res) as TwitterTimeline
    const { home, search_by_raw_query, threaded_conversation_with_injections_v2, user } = data.data
    if (home) {
      home.home_timeline_urt.instructions = transformInstructions(home.home_timeline_urt.instructions)
      // const before = data.data.home.home_timeline_urt.instructions[0].entries
      // const after = before.filter((x) => !x.entryId.startsWith('promoted'))
      // data.data.home.home_timeline_urt.instructions[0].entries = after
    } else if (search_by_raw_query) {
      search_by_raw_query.search_timeline.timeline.instructions = transformInstructions(
        search_by_raw_query.search_timeline.timeline.instructions,
      )
    } else if (threaded_conversation_with_injections_v2) {
      threaded_conversation_with_injections_v2.instructions = transformInstructions(
        threaded_conversation_with_injections_v2.instructions,
      )
    } else if (user) {
      user.result.timeline.timeline.instructions = transformInstructions(user.result.timeline.timeline.instructions)
    }
    return JSON.stringify(data)
  }
}
