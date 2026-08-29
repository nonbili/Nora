import { NativeModule, requireNativeModule } from 'expo'
import type { ProfileCookie } from '@/lib/cookies'

declare class NoraViewModule extends NativeModule {
  clearProfileData(profile: string): Promise<void>
  clearHostData(profile: string, host: string): Promise<void>
  getCookies(url: string, profile?: string | null): Promise<string>
  getProfileCookies(profile: string): Promise<ProfileCookie[]>
  openExternalUrl(url: string): Promise<boolean>
  // Android only: the iOS module has no equivalent, so both are optional.
  isPinShortcutSupported?(): boolean
  pinTabShortcut?(
    id: string,
    url: string,
    label: string,
    iconUrl: string | null,
    manifestUrl: string | null,
    profile: string,
    userAgent: string,
  ): Promise<boolean>
  reloadBlocklistFromDisk?(enabled: boolean, revision: number): Promise<boolean>
  reloadBlocklistFromSourceFiles?(enabled: boolean, revision: number): Promise<boolean>
  setSettings(settings: object): void
  setBlocklist(blocklist: object): void
  // Newline-encoded host keys; optional so older native builds keep working.
  setBlocklistExcludedHosts?(hosts: string): void
  setLocaleStrings(strings: object): void
  translateText(text: string, targetLanguage: string): Promise<{ text: string; sourceLanguage?: string }>
  getTranslationSupportedLanguages(): Promise<string[]>
}

export default requireNativeModule<NoraViewModule>('NoraView')
