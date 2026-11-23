export interface InterceptedRequest {
  url: string
  /** The body passed to `send()`, for POST requests that carry their variables there. */
  body?: unknown
}

export interface TransformOptions {
  /** The per-site "Block ads" switch. Services may still fix non-ad issues when it is off. */
  blockAds: boolean
}

export abstract class BaseService {
  videoUrl: string | undefined

  abstract shouldIntercept(url: string): boolean

  abstract transformResponse(res: string, request: InterceptedRequest, options: TransformOptions): string
}
