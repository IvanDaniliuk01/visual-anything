/**
 * The app in English and Spanish (ADR-0038). Code writes English; `t()` and `useT()` look each text up
 * in the language's catalog, `es.ts` for Spanish, and show the English when it has no entry.
 */
export {
  browserLanguage,
  currentLanguage,
  navigatorLanguages,
  resolveLanguage,
  setCurrentLanguage,
  subscribeLanguage,
  type LanguageChoice,
} from './language';
export { t, translatorFor, type Translator } from './t';
export {
  LANGUAGES,
  formOf,
  translate,
  translateMessage,
  type Language,
  type PluralText,
  type Text,
  type Values,
} from './translate';
export { LanguageContext, useT } from './useT';
