import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import arText from '@/locales/ar.json'
import elText from '@/locales/el.json'
import enText from '@/locales/en.json'
import esText from '@/locales/es.json'
import frText from '@/locales/fr.json'
import itText from '@/locales/it.json'
import koText from '@/locales/ko.json'
import lvText from '@/locales/lv.json'
import plText from '@/locales/pl.json'
import ptBRText from '@/locales/pt_BR.json'
import svText from '@/locales/sv.json'
import trText from '@/locales/tr.json'
import zhHansText from '@/locales/zh_Hans.json'
import zhHantText from '@/locales/zh_Hant.json'
import type { Locale } from 'expo-localization'

export const supportedI18nLanguages = [
  'ar',
  'el',
  'en',
  'es',
  'fr',
  'it',
  'ko',
  'lv',
  'pl',
  'pt_BR',
  'sv',
  'tr',
  'zh_Hans',
  'zh_Hant',
] as const
export type SupportedI18nLanguage = (typeof supportedI18nLanguages)[number]

const resources: Record<SupportedI18nLanguage, { translation: any }> = {
  ar: {
    translation: arText,
  },
  el: {
    translation: elText,
  },
  en: {
    translation: enText,
  },
  es: {
    translation: esText,
  },
  fr: {
    translation: frText,
  },
  it: {
    translation: itText,
  },
  ko: {
    translation: koText,
  },
  lv: {
    translation: lvText,
  },
  pl: {
    translation: plText,
  },
  pt_BR: {
    translation: ptBRText,
  },
  sv: {
    translation: svText,
  },
  tr: {
    translation: trText,
  },
  zh_Hans: {
    translation: zhHansText,
  },
  zh_Hant: {
    translation: zhHantText,
  },
}

const isSupportedLanguage = (value?: string | null): value is SupportedI18nLanguage =>
  Boolean(value && supportedI18nLanguages.includes(value as any))

export const resolveI18nLanguageFromExpoLocale = (locale?: Locale): SupportedI18nLanguage | undefined => {
  if (!locale?.languageCode) {
    return undefined
  }

  if (locale.languageCode === 'zh') {
    const script = locale.languageScriptCode
    if (script === 'Hans' || script === 'Hant') {
      return `zh_${script}` as SupportedI18nLanguage
    }
    const region = locale.regionCode?.toUpperCase()
    return region === 'TW' || region === 'HK' || region === 'MO' ? 'zh_Hant' : 'zh_Hans'
  }

  if (locale.languageCode === 'pt') {
    return 'pt_BR'
  }

  return isSupportedLanguage(locale.languageCode) ? locale.languageCode : undefined
}

export const normalizeI18nLanguage = (value?: string | null): SupportedI18nLanguage | null =>
  value == null ? null : isSupportedLanguage(value) ? value : null

i18n.use(initReactI18next).init({
  /* debug: true, */
  fallbackLng: 'en',
  supportedLngs: Object.keys(resources),
  resources,
})
