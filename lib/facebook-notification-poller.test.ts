import { describe, expect, it } from 'bun:test'
import {
  buildFacebookNotificationItemInput,
  facebookNotificationItemDetails,
  parseFacebookNotificationCounts,
} from './facebook-notification-poller'

describe('parseFacebookNotificationCounts', () => {
  it('extracts unread counts from matching bookmark links', () => {
    const html = `
      <a href="/friends/center/requests/"><span>Friend requests</span><strong>2</strong></a>
      <a href="/messages/"><span>Messages</span><strong>5</strong></a>
      <a href="/groups/"><span>Groups</span><strong>3</strong></a>
      <a href="/notifications.php"><span>Notifications</span><strong>9+</strong></a>
    `

    expect(parseFacebookNotificationCounts(html)).toEqual({
      friends: 2,
      messages: 5,
      groups: 3,
      notifications: 9,
    })
  })

  it('ignores missing and non-numeric categories', () => {
    const html = `
      <a href="/messages/"><span>Messages</span><strong>New</strong></a>
      <a href="/groups/">Groups</a>
    `

    expect(parseFacebookNotificationCounts(html)).toEqual({
      friends: 0,
      messages: 0,
      groups: 0,
      notifications: 0,
    })
  })

  it('uses the highest count across duplicate matching links', () => {
    const html = `
      <a href="/messages/"><strong>1</strong></a>
      <a href="https://m.facebook.com/messages/"><strong>12</strong></a>
    `

    expect(parseFacebookNotificationCounts(html).messages).toBe(12)
  })
})

describe('facebook notification item conversion', () => {
  it('creates items only for count increases', () => {
    expect(
      buildFacebookNotificationItemInput(
        'default',
        { friends: 2, messages: 5, groups: 0, notifications: 1 },
        { friends: 2, messages: 3, groups: 1, notifications: 0 },
      ),
    ).toEqual([
      { profileId: 'default', category: 'messages', count: 5 },
      { profileId: 'default', category: 'notifications', count: 1 },
    ])
  })

  it('builds stable details for notification scheduling', () => {
    expect(facebookNotificationItemDetails({ profileId: 'work', category: 'messages', count: 4 })).toEqual({
      id: 'work:messages:4',
      url: 'https://m.facebook.com/messages/',
      title: 'Facebook messages',
      body: 'You have 4 new messages.',
    })
  })
})
