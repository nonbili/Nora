import { describe, expect, it } from 'bun:test'
import { htmlToText } from './html'

describe('htmlToText', () => {
  it('keeps paragraphs and line breaks, mentions and hashtags as shown, and other links in full', () => {
    const html =
      '<p>Hi <span class="h-card"><a href="https://sunny.garden/@kurio" class="u-url mention">@<span>kurio</span></a></span> &amp; all<br>' +
      '<a href="https://chaos.social/tags/cats" class="mention hashtag" rel="tag">#<span>cats</span></a></p>' +
      '<p><a href="https://www.rawstory.com/no-kings/" rel="nofollow"><span class="invisible">https://www.</span><span class="ellipsis">rawstory.com/no-k</span></a></p>'
    expect(htmlToText(html)).toBe('Hi @kurio & all\n#cats\n\nhttps://www.rawstory.com/no-kings/')
  })

  it('makes a link within the site whole', () => {
    expect(htmlToText('<p>see <a href="/r/RDDT/comments/1">this</a></p>', 'https://www.reddit.com')).toBe(
      'see https://www.reddit.com/r/RDDT/comments/1',
    )
  })
})
