import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import es from './locales/es.json';
import vi from './locales/vi.json';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    vi: { translation: vi },
  },
  lng: localStorage.getItem('housing-lang') ?? 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

const syncLang = (lng: string) => { document.documentElement.lang = lng.slice(0, 2); };
syncLang(i18n.language ?? 'en');
i18n.on('languageChanged', syncLang);

export default i18n;
