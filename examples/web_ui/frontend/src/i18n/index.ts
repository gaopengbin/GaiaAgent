import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zh from './locales/zh'
import en from './locales/en'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      zh: { translation: zh },
      en: { translation: en },
    },
    lng: localStorage.getItem('lang') ?? 'zh',
    fallbackLng: 'zh',
    interpolation: { escapeValue: false },
  })

export function setLanguage(lang: 'zh' | 'en') {
  localStorage.setItem('lang', lang)
  i18n.changeLanguage(lang)
}

export default i18n
