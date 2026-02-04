import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import arText from '@/locales/ar.json'
import enText from '@/locales/en.json'
import esText from '@/locales/es.json'
import frText from '@/locales/fr.json'
import itText from '@/locales/it.json'
/* import jaText from '@/locales/ja.json' */
import plText from '@/locales/pl.json'
import zhHansText from '@/locales/zh_Hans.json'

const resources = {
  ar: {
    translation: arText,
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
  /* ja: {
   *   translation: jaText,
   * }, */
  pl: {
    translation: plText,
  },
  zh_Hans: {
    translation: zhHansText,
  },
}

i18n.use(initReactI18next).init({
  /* debug: true, */
  fallbackLng: 'en',
  supportedLngs: Object.keys(resources),
  resources,
})
