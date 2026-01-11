import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import arText from '@/locales/ar.json'
import enText from '@/locales/en.json'
import frText from '@/locales/fr.json'
/* import jaText from '@/locales/ja.json' */

i18n.use(initReactI18next).init({
  /* debug: true, */
  fallbackLng: 'en',
  supportedLngs: ['ar', 'en', 'fr'],
  resources: {
    ar: {
      translation: arText,
    },
    en: {
      translation: enText,
    },
    fr: {
      translation: frText,
    },
    /* ja: {
     *   translation: jaText,
     * }, */
  },
})
