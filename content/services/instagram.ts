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
    const data = JSON.parse(res) as InstagramTimeline
    const before = data.data.xdt_api__v1__feed__timeline__connection?.edges
    if (!before) {
      return res
    }
    const after = before.filter((x) => !x.node.ad)
    data.data.xdt_api__v1__feed__timeline__connection.edges = after
    return JSON.stringify(data)
  }
}
