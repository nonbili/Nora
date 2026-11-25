import { InstagramService } from './instagram'
import { isPinterestHost, PinterestService } from './pinterest'
import { TwitterService } from './twitter'

const services = {
  'www.instagram.com': new InstagramService(),
  'x.com': new TwitterService(),
}
const pinterest = new PinterestService()

export function getServiceForHost(host: string) {
  return services[host as keyof typeof services] ?? (isPinterestHost(host) ? pinterest : undefined)
}

export function getService(url: string) {
  return getServiceForHost(new URL(url).host)
}
