import { NativeModule, requireNativeModule } from 'expo'

declare class NoraViewModule extends NativeModule {
  clearProfileData(profile: string): Promise<void>
  clearHostData(profile: string, host: string): Promise<void>
  getCookies(url: string, profile?: string | null): Promise<string>
  openExternalUrl(url: string): Promise<boolean>
  reloadBlocklistFromDisk?(enabled: boolean, revision: number): Promise<boolean>
  reloadBlocklistFromSourceFiles?(enabled: boolean, revision: number): Promise<boolean>
  setSettings(settings: object): void
  setBlocklist(blocklist: object): void
  setLocaleStrings(strings: object): void
}

export default requireNativeModule<NoraViewModule>('NoraView')
