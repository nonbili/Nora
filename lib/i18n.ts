import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import arText from '@/locales/ar.json'
import deText from '@/locales/de.json'
import elText from '@/locales/el.json'
import enText from '@/locales/en.json'
import esText from '@/locales/es.json'
import etText from '@/locales/et.json'
import frText from '@/locales/fr.json'
import itText from '@/locales/it.json'
import koText from '@/locales/ko.json'
import lvText from '@/locales/lv.json'
import plText from '@/locales/pl.json'
import ptText from '@/locales/pt.json'
import ptBRText from '@/locales/pt_BR.json'
import ruText from '@/locales/ru.json'
import svText from '@/locales/sv.json'
import trText from '@/locales/tr.json'
import ukText from '@/locales/uk.json'
import viText from '@/locales/vi.json'
import zhHansText from '@/locales/zh_Hans.json'
import zhHantText from '@/locales/zh_Hant.json'
import type { Locale } from 'expo-localization'

export const supportedI18nLanguages = [
  'ar',
  'de',
  'el',
  'en',
  'es',
  'et',
  'fr',
  'it',
  'ko',
  'lv',
  'pl',
  'pt',
  'pt_BR',
  'ru',
  'sv',
  'tr',
  'uk',
  'vi',
  'zh_Hans',
  'zh_Hant',
] as const
export type SupportedI18nLanguage = (typeof supportedI18nLanguages)[number]

const resources: Record<SupportedI18nLanguage, { translation: any }> = {
  ar: {
    translation: arText,
  },
  de: {
    translation: deText,
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
  et: {
    translation: etText,
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
  pt: {
    translation: ptText,
  },
  pt_BR: {
    translation: ptBRText,
  },
  ru: {
    translation: ruText,
  },
  sv: {
    translation: svText,
  },
  tr: {
    translation: trText,
  },
  uk: {
    translation: ukText,
  },
  vi: {
    translation: viText,
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
    const region = locale.regionCode?.toUpperCase()
    return region === 'BR' ? 'pt_BR' : 'pt'
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
