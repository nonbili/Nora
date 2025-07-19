export abstract class BaseService {
  abstract shouldIntercept(url: string): boolean

  abstract transformResponse(res: string): string
}
