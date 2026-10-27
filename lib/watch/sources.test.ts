import { describe, expect, it } from 'bun:test'
import { feedChipSources, filterWatchSources, sortWatchSources, type WatchSourceSort } from './sources'

describe('sortWatchSources', () => {
  const source = (handle: string, addedAt: number, lastSuccessAt?: number, name?: string) => ({
    key: `x:${handle}`,
    site: 'x' as const,
    handle,
    name,
    addedAt,
    lastSuccessAt,
  })
  const sources = [source('bob', 2, 20), source('amy', 3), source('carl', 1, 30, 'Zed')]
  const newestPostAt = { 'x:bob': 50, 'x:carl': 40 }
  const order = (sort: WatchSourceSort, reversed?: boolean) =>
    sortWatchSources(sources, newestPostAt, sort, reversed).map((current) => current.handle)

  it('orders by name, the shown one before the handle', () => {
    expect(order('name')).toEqual(['amy', 'bob', 'carl'])
    expect(order('name', true)).toEqual(['carl', 'bob', 'amy'])
  })

  it('orders by time newest first, with those that have none last either way', () => {
    expect(order('updated')).toEqual(['bob', 'carl', 'amy'])
    expect(order('updated', true)).toEqual(['carl', 'bob', 'amy'])
    expect(order('added')).toEqual(['amy', 'bob', 'carl'])
    expect(order('synced')).toEqual(['carl', 'bob', 'amy'])
    expect(order('synced', true)).toEqual(['bob', 'carl', 'amy'])
  })
})

describe('feedChipSources', () => {
  const source = (handle: string) => ({ key: `x:${handle}`, site: 'x' as const, handle, addedAt: 0 })
  const sources = [source('old'), source('quiet'), source('new'), source('unread')]
  const newestPostAt = { 'x:old': 10, 'x:new': 30, 'x:unread': 20 }
  const unread = new Set(['x:unread'])
  const handles = (list: { handle: string }[]) => list.map((current) => current.handle)

  it('puts those with unread posts first, then the latest to post', () => {
    const { shown, hidden } = feedChipSources(sources, newestPostAt, unread, 10)
    expect(handles(shown)).toEqual(['unread', 'new', 'old', 'quiet'])
    expect(hidden).toBe(0)
  })

  it('stops at the limit, and keeps the one shown past it', () => {
    expect(feedChipSources(sources, newestPostAt, unread, 2)).toMatchObject({ hidden: 2 })
    const { shown, hidden } = feedChipSources(sources, newestPostAt, unread, 2, 'x:quiet')
    expect(handles(shown)).toEqual(['unread', 'new', 'quiet'])
    expect(hidden).toBe(1)
  })
})

describe('filterWatchSources', () => {
  const sources = [
    { site: 'x' as const, handle: 'NASA', name: 'NASA' },
    { site: 'instagram' as const, handle: 'nasa' },
    { site: 'reddit' as const, handle: 'r/pics', name: 'Pictures' },
  ]
  const sites = (query: string, site?: 'x' | 'reddit') => filterWatchSources(sources, query, site).map((current) => current.site)

  it('matches name, handle and site, without case or a leading @', () => {
    expect(sites('nasa')).toEqual(['x', 'instagram'])
    expect(sites('@nasa insta')).toEqual(['instagram'])
    expect(sites('pictures')).toEqual(['reddit'])
    expect(sites('')).toEqual(['x', 'instagram', 'reddit'])
  })

  it('keeps to the site chosen', () => {
    expect(sites('nasa', 'x')).toEqual(['x'])
    expect(sites('', 'reddit')).toEqual(['reddit'])
  })
})
