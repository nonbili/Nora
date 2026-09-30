import { BaseService } from './base'

interface InstagramEdge {
  node: {
    ad: null | object
  }
}

interface InstagramTimeline {
  data: {
    xdt_api__v1__feed__timeline__connection: {
      edges: InstagramEdge[]
    }
  }
}

export class InstagramService extends BaseService {
  shouldIntercept(url: string) {
    return url.startsWith('https://www.instagram.com/graphql/query')
  }

  transformResponse(res: string) {
    // Every GraphQL query shares one endpoint, and only the feed carries ads. A substring
    // scan is far cheaper than parsing and re-serializing every other query's payload.
    if (!res.includes('xdt_api__v1__feed__timeline__connection')) {
      return res
    }
    const data = JSON.parse(res) as InstagramTimeline
    const before = data.data.xdt_api__v1__feed__timeline__connection?.edges
    if (!before) {
      return res
    }
    data.data.xdt_api__v1__feed__timeline__connection.edges = before.filter((x) => !x.node.ad)
    return JSON.stringify(data)
  }
}
