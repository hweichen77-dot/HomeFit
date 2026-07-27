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

// Keep the document language in sync with the active UI language so screen
// readers announce Spanish and Vietnamese content with the right pronunciation.
// The html tag ships as lang="en"; without this a returning es/vi user or a
// runtime language switch would leave the whole translated UI marked English.
function syncDocumentLang(lng: string): void {
  if (typeof document !== 'undefined' && lng) {
    document.documentElement.lang = lng.slice(0, 2);
  }
}

syncDocumentLang(i18n.language);
i18n.on('languageChanged', syncDocumentLang);

export default i18n;
