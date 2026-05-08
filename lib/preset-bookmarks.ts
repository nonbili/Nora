export interface PresetBookmarkGroup {
  id: string
  title: string
}

export interface PresetBookmark {
  id: string
  groupId: string
  title: string
  url: string
  icon: string
}

export const presetBookmarkGroups: PresetBookmarkGroup[] = [
  { id: 'preset-messaging', title: 'Messaging' },
  { id: 'preset-sns', title: 'SNS' },
  { id: 'preset-ai', title: 'AI' },
  { id: 'preset-news', title: 'News' },
]

const getDuckDuckGoIcon = (url: string) => {
  try {
    return `https://icons.duckduckgo.com/ip3/${new URL(url).hostname}.ico`
  } catch {
    return ''
  }
}

export const presetBookmarks: PresetBookmark[] = [
  { id: 'preset-sns-pinterest', groupId: 'preset-sns', title: 'Pinterest', url: 'https://www.pinterest.com' },
  { id: 'preset-sns-mastodon', groupId: 'preset-sns', title: 'Mastodon', url: 'https://mastodon.social' },
  { id: 'preset-sns-twitch', groupId: 'preset-sns', title: 'Twitch', url: 'https://www.twitch.tv' },
  { id: 'preset-sns-quora', groupId: 'preset-sns', title: 'Quora', url: 'https://www.quora.com' },
  { id: 'preset-sns-medium', groupId: 'preset-sns', title: 'Medium', url: 'https://medium.com' },
  {
    id: 'preset-sns-substack',
    groupId: 'preset-sns',
    title: 'Substack',
    url: 'https://substack.com',
    icon: 'https://substack.com/favicon.ico',
  },
  { id: 'preset-messaging-telegram', groupId: 'preset-messaging', title: 'Telegram', url: 'https://web.telegram.org' },
  { id: 'preset-messaging-discord', groupId: 'preset-messaging', title: 'Discord', url: 'https://discord.com/app' },
  {
    id: 'preset-messaging-whatsapp',
    groupId: 'preset-messaging',
    title: 'WhatsApp',
    url: 'https://web.whatsapp.com',
    icon: 'https://www.whatsapp.com/favicon.ico',
  },
  { id: 'preset-messaging-slack', groupId: 'preset-messaging', title: 'Slack', url: 'https://slack.com/signin' },
  { id: 'preset-ai-chatgpt', groupId: 'preset-ai', title: 'ChatGPT', url: 'https://chatgpt.com' },
  { id: 'preset-ai-claude', groupId: 'preset-ai', title: 'Claude', url: 'https://claude.ai' },
  { id: 'preset-ai-gemini', groupId: 'preset-ai', title: 'Gemini', url: 'https://gemini.google.com' },
  { id: 'preset-ai-perplexity', groupId: 'preset-ai', title: 'Perplexity', url: 'https://www.perplexity.ai' },
  { id: 'preset-ai-grok', groupId: 'preset-ai', title: 'Grok', url: 'https://grok.com' },
  { id: 'preset-ai-poe', groupId: 'preset-ai', title: 'Poe', url: 'https://poe.com' },
  { id: 'preset-ai-huggingface', groupId: 'preset-ai', title: 'Hugging Face', url: 'https://huggingface.co' },
  { id: 'preset-ai-characterai', groupId: 'preset-ai', title: 'Character.AI', url: 'https://character.ai' },
  { id: 'preset-news-bbc', groupId: 'preset-news', title: 'BBC News', url: 'https://www.bbc.com/news' },
  { id: 'preset-news-reuters', groupId: 'preset-news', title: 'Reuters', url: 'https://www.reuters.com' },
  { id: 'preset-news-ap', groupId: 'preset-news', title: 'AP News', url: 'https://apnews.com' },
  { id: 'preset-news-npr', groupId: 'preset-news', title: 'NPR', url: 'https://www.npr.org' },
  { id: 'preset-news-nyt', groupId: 'preset-news', title: 'The New York Times', url: 'https://www.nytimes.com' },
  {
    id: 'preset-news-guardian',
    groupId: 'preset-news',
    title: 'The Guardian',
    url: 'https://www.theguardian.com/international',
  },
  { id: 'preset-news-cnn', groupId: 'preset-news', title: 'CNN', url: 'https://www.cnn.com' },
  { id: 'preset-news-aljazeera', groupId: 'preset-news', title: 'Al Jazeera', url: 'https://www.aljazeera.com' },
].map((bookmark) => ({
  ...bookmark,
  icon: bookmark.icon || getDuckDuckGoIcon(bookmark.url),
}))
