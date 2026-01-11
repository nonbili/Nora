export type TwitterResponse = {
  data: {
    // HomeTimeline | HomeLatestTimeline
    home?: {
      home_timeline_urt: {
        instructions: Instruction[]
      }
    }
    // SearchTimeline
    search_by_raw_query?: {
      search_timeline: {
        timeline: {
          instructions: Instruction[]
        }
      }
    }
    // TweetDetail
    threaded_conversation_with_injections_v2?: {
      instructions: Instruction[]
      metadata?: {
        scribeConfig?: {
          page?: string
        }
      }
    }
    // UserTweets
    user?: {
      result: {
        timeline: {
          timeline: {
            instructions: Instruction[]
          }
        }
      }
    }
    // Tweet
    tweetResult: {
      result: Tweet
    }
  }
}

export type Instruction =
  | { type: 'TimelineClearCache' }
  | TimelineAddEntries
  | { type: 'TimelineTerminateTimeline'; direction: 'Top' | 'Bottom' }

export interface TimelineAddEntries {
  type: 'TimelineAddEntries'
  entries: Entry[]
}

export type Entry = TweetEntry | ConversationThreadEntry | TimelineCursorEntry

export interface TweetEntry {
  entryId: string
  sortIndex: string
  content: {
    entryType: 'TimelineTimelineItem'
    __typename: 'TimelineTimelineItem'
    itemContent: {
      itemType: 'TimelineTweet'
      __typename: 'TimelineTweet'
      tweetDisplayType: 'Tweet'
      tweet_results: {
        result: Tweet | TweetWithVisibilityResults
      }
    }
    clientEventInfo?: {
      component: string
      element: string
    }
  }
}

export interface ConversationThreadEntry {
  entryId: string
  sortIndex: string
  content: {
    entryType: 'TimelineTimelineModule'
    __typename: 'TimelineTimelineModule'
    items: ModuleItem[]
    metadata?: {
      conversationMetadata?: {
        allTweetIds?: string[]
        enableDeduplication?: boolean
      }
    }
    displayType: 'VerticalConversation'
    clientEventInfo?: {
      component: string
      details?: {
        conversationDetails?: {
          conversationSection?: string
        }
        timelinesDetails?: {
          controllerData?: string
        }
      }
    }
  }
}

export interface TimelineCursorEntry {
  entryId: string
  sortIndex: string
  content: {
    entryType: 'TimelineTimelineCursor'
    __typename: 'TimelineTimelineCursor'
    cursorType: 'Top' | 'Bottom'
    value: string
  }
}

export interface ModuleItem {
  entryId: string
  item: {
    itemContent: {
      itemType: 'TimelineTweet'
      __typename: 'TimelineTweet'
      tweetDisplayType: 'Tweet'
      tweet_results: {
        result: Tweet | TweetWithVisibilityResults
      }
    }
    clientEventInfo?: {
      component: string
      element: string
      details?: {
        conversationDetails?: {
          conversationSection?: string
        }
        timelinesDetails?: {
          controllerData?: string
        }
      }
    }
  }
}

export type Tweet = {
  __typename: 'Tweet'
  rest_id: string
  has_birdwatch_notes: boolean
  core: {
    user_results: {
      result: User
    }
  }
  unmention_data: Record<string, unknown>
  edit_control?: {
    edit_tweet_ids: string[]
    editable_until_msecs: string
    is_edit_eligible: boolean
    edits_remaining: string
  }
  is_translatable: boolean
  views?: {
    count: string
    state: string
  }
  source?: string
  grok_analysis_button?: boolean
  legacy: TweetLegacy
  quick_promote_eligibility?: {
    eligibility: string
  }
  card?: Card
}

export type TweetWithVisibilityResults = {
  __typename: 'TweetWithVisibilityResults'
  tweet: Tweet
  visibilityResults?: Record<string, unknown>
}

export interface User {
  __typename: 'User'
  id: string
  rest_id: string
  affiliates_highlighted_label?:
    | {
        label?: {
          url?: {
            url: string
            urlType: string
          }
          badge?: {
            url: string
          }
          description: string
          userLabelType: string
          userLabelDisplayType: string
        }
      }
    | Record<string, unknown>
  avatar?: {
    image_url: string
  }
  core: {
    created_at: string
    name: string
    screen_name: string
  }
  dm_permissions: {
    can_dm: boolean
  }
  follow_request_sent: boolean
  has_graduated_access: boolean
  is_blue_verified: boolean
  legacy: UserLegacy
  location?: {
    location: string
  }
  media_permissions: {
    can_media_tag: boolean
  }
  parody_commentary_fan_label: string
  profile_image_shape: 'Square' | 'Circle'
  professional?: {
    rest_id: string
    professional_type: string
    category: Category[]
  }
  profile_bio?: {
    description: string
  }
  privacy: {
    protected: boolean
  }
  relationship_perspectives: {
    following: boolean
  }
  tipjar_settings: Record<string, unknown>
  verification: {
    verified: boolean
    verified_type?: string
  }
  profile_description_language?: string
  super_follow_eligible?: boolean
}

export interface UserLegacy {
  default_profile: boolean
  default_profile_image: boolean
  description: string
  entities: {
    description: {
      urls: UrlEntity[]
    }
    url?: {
      urls: UrlEntity[]
    }
  }
  fast_followers_count: number
  favourites_count: number
  followers_count: number
  friends_count: number
  has_custom_timelines: boolean
  is_translator: boolean
  listed_count: number
  media_count: number
  normal_followers_count: number
  pinned_tweet_ids_str: string[]
  possibly_sensitive: boolean
  profile_banner_url: string
  profile_interstitial_type: string
  statuses_count: number
  translator_type: 'none' | 'regular'
  url?: string
  want_retweets: boolean
  withheld_in_countries: unknown[]
}

export interface TweetLegacy {
  bookmark_count: number
  bookmarked: boolean
  created_at: string
  conversation_id_str: string
  display_text_range: [number, number]
  entities: TweetEntities
  extended_entities?: {
    media: MediaEntity[]
  }
  favorite_count: number
  favorited: boolean
  full_text: string
  in_reply_to_screen_name?: string
  in_reply_to_status_id_str?: string
  in_reply_to_user_id_str?: string
  is_quote_status: boolean
  lang: string
  possibly_sensitive: boolean
  possibly_sensitive_editable: boolean
  quote_count: number
  reply_count: number
  retweet_count: number
  retweeted: boolean
  user_id_str: string
  id_str: string
}

export interface TweetEntities {
  hashtags: unknown[]
  media?: MediaEntity[]
  symbols: unknown[]
  timestamps: unknown[]
  urls: UrlEntity[]
  user_mentions: UserMention[]
}

export interface MediaEntity {
  display_url: string
  expanded_url: string
  id_str: string
  indices: [number, number]
  media_key: string
  media_url_https: string
  type: 'photo' | 'video' | 'animated_gif'
  url: string
  additional_media_info?: {
    monetizable: boolean
  }
  ext_media_availability?: {
    status: string
  }
  sizes?: {
    large: Size
    medium: Size
    small: Size
    thumb: Size
  }
  original_info?: {
    height: number
    width: number
    focus_rects: unknown[]
  }
  video_info?: {
    aspect_ratio: [number, number]
    duration_millis: number
    variants: VideoVariant[]
  }
  media_results?: {
    result: {
      media_key: string
    }
  }
}

export interface Size {
  h: number
  w: number
  resize: 'fit' | 'crop'
}

export interface VideoVariant {
  bitrate?: number
  content_type: string
  url: string
}

export interface UrlEntity {
  display_url: string
  expanded_url: string
  url: string
  indices: [number, number]
}

export interface UserMention {
  id_str: string
  name: string
  screen_name: string
  indices: [number, number]
}

export interface Category {
  id: number
  name: string
  icon_name: string
}

export interface Card {
  rest_id: string
  legacy: {
    binding_values: BindingValue[]
  }
}

export interface BindingValue {
  key: string
  value: {
    type: 'STRING' | 'IMAGE' | 'BOOLEAN' | 'NUMBER'
    string_value?: string
    image_value?: {
      height: number
      width: number
      url: string
    }
    boolean_value?: boolean
    number_value?: number
  }
}
