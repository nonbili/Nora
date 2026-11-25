import { expect, test } from 'bun:test'
import { filterInitialProps, isPinterestHost, PinterestService } from './pinterest'

const organic = (id: string) => ({ type: 'pin', id, is_downstream_promotion: false, promoter: null })
const homefeed = 'https://jp.pinterest.com/resource/UserHomefeedResource/get/?source_url=%2F&data=%7B%7D'
const ids = (items: any[]) => items.map((p) => p.id)

test('drops promoted and saved-ad pins from the home feed', () => {
  const service = new PinterestService()
  const res = JSON.stringify({
    resource_response: {
      data: [
        organic('1'),
        { type: 'pin', id: 'ad', is_promoted: true, promoter: { id: 'u' } },
        { type: 'pin', id: 'saved-ad', is_downstream_promotion: true, promoter: { id: 'u' } },
        { type: 'pin', id: 'promoter-only', promoter: { id: 'u' } },
        organic('2'),
      ],
    },
  })
  const out = JSON.parse(service.transformResponse(res, { url: homefeed }, { blockAds: true }))
  expect(ids(out.resource_response.data)).toEqual(['1', '2'])
})

test('drops promoted pins from search results', () => {
  const service = new PinterestService()
  const res = JSON.stringify({
    resource_response: { data: { results: [organic('1'), { type: 'pin', id: 'ad', is_promoted: true }] } },
  })
  const out = JSON.parse(service.transformResponse(res, { url: homefeed }, { blockAds: true }))
  expect(ids(out.resource_response.data.results)).toEqual(['1'])
})

test('leaves responses untouched without ads or with ad blocking off', () => {
  const service = new PinterestService()
  const clean = JSON.stringify({ resource_response: { data: [organic('1')] } })
  expect(service.transformResponse(clean, { url: homefeed }, { blockAds: true })).toBe(clean)
  const ad = JSON.stringify({ resource_response: { data: [{ type: 'pin', id: 'ad', is_promoted: true }] } })
  expect(service.transformResponse(ad, { url: homefeed }, { blockAds: false })).toBe(ad)
})

test('matches Pinterest hosts and resource GETs only', () => {
  for (const host of ['www.pinterest.com', 'jp.pinterest.com', 'pinterest.co.uk', 'www.pinterest.fr', 'br.pinterest.com']) {
    expect(isPinterestHost(host)).toBe(true)
  }
  expect(isPinterestHost('pinterest.example.com')).toBe(false)
  const service = new PinterestService()
  expect(service.shouldIntercept(homefeed)).toBe(true)
  expect(service.shouldIntercept('https://www.pinterest.com/resource/ApiResource/create/')).toBe(false)
  expect(service.shouldIntercept('https://example.com/resource/UserHomefeedResource/get/')).toBe(false)
})

test('country subdomains resolve to the Pinterest service', async () => {
  const { getHostHome } = await import('../css')
  expect(getHostHome('www.pinterest.com')).toBe('pinterest')
  expect(getHostHome('jp.pinterest.com')).toBe('pinterest')
  expect(getHostHome('x.com')).toBe('x')
  expect(getHostHome('example.com')).toBeUndefined()
})

test('drops promoted pins from the server-rendered first page', () => {
  const key = '[["query","shoes"],["scope","pins"]]'
  const props = {
    initialReduxState: {
      resources: {
        BaseSearchResource: { [key]: { data: { results: [organic('1'), { type: 'pin', id: 'ad', is_promoted: true }] } } },
        UserHomefeedResource: { '[]': { data: [{ type: 'pin', id: 'ad2', promoter: { id: 'u' } }, organic('2')] } },
        UserResource: { '[]': { data: { id: 'me' } } },
      },
    },
  }
  const out = JSON.parse(filterInitialProps(JSON.stringify(props))!)
  expect(ids(out.initialReduxState.resources.BaseSearchResource[key].data.results)).toEqual(['1'])
  expect(ids(out.initialReduxState.resources.UserHomefeedResource['[]'].data)).toEqual(['2'])
  expect(out.initialReduxState.resources.UserResource['[]'].data).toEqual({ id: 'me' })
})

test('leaves the first page alone when it has no ads or is still partial', () => {
  const clean = JSON.stringify({ initialReduxState: { resources: { UserHomefeedResource: { '[]': { data: [organic('1')] } } } } })
  expect(filterInitialProps(clean)).toBeNull()
  expect(filterInitialProps('{"initialReduxState":{"resources":{"X":{"[]":{"data":[{"is_promoted":true')).toBeNull()
})

test('spots promoted pins in formatted JSON', () => {
  const service = new PinterestService()
  const res = JSON.stringify({ resource_response: { data: [organic('1'), { type: 'pin', id: 'ad', is_promoted: true }] } }, null, 2)
  const out = JSON.parse(service.transformResponse(res, { url: homefeed }, { blockAds: true }))
  expect(ids(out.resource_response.data)).toEqual(['1'])
})
