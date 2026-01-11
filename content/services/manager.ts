import { InstagramService } from './instagram'
import { TwitterService } from './twitter'

const services = {
  'www.instagram': new InstagramService(),
  'x.com': new TwitterService(),
}

export function getService(url: string) {
  const { host } = new URL(url)
  return services[host as keyof typeof services]
}
