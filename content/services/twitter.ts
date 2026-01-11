import { BaseService } from './base'
import { Instruction, Tweet, TweetEntry, TwitterResponse } from './twitter/types'

function transformInstructions(instructions: Instruction[]) {
  return instructions.map((instruction) => {
    if (instruction.type == 'TimelineAddEntries') {
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

export class TwitterService extends BaseService {
  shouldIntercept(url: string) {
    return re1.test(url)
  }

  transformResponse(res: string) {
    const data = JSON.parse(res) as TwitterResponse
    const { home, search_by_raw_query, threaded_conversation_with_injections_v2, user, tweetResult } = data.data
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
