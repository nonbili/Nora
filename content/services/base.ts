export abstract class BaseService {
  videoUrl: string | undefined

  abstract shouldIntercept(url: string): boolean

  abstract transformResponse(res: string): string
}
