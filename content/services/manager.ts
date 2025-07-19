import { InstagramService } from './instagram'
import { TwitterService } from './twitter'

const services = [new InstagramService(), new TwitterService()]

export function getService(url: string) {
  for (const service of services) {
    if (service.shouldIntercept(url)) {
      return service
    }
  }
}
