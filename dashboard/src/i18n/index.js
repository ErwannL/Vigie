import en from './en.js';
import fr from './fr.js';

export const LANGUAGES = Object.freeze(['en', 'fr']);
export const DICTIONARIES = Object.freeze({ en, fr });

/** Looks a key up in one language; `{name}` placeholders are filled from `vars`. */
export function translate(lang, key, vars = {}) {
  const text = DICTIONARIES[lang][key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => String(vars[name]));
}

/** Server error codes are never displayed raw: each maps to a key, unknown ones to a generic one. */
export function errorKey(code) {
  const key = `errors.${code}`;
  return key in en ? key : 'errors.unknown';
}

export function initialLanguage(stored, navigatorLanguage) {
  if (LANGUAGES.includes(stored)) return stored;
  return String(navigatorLanguage).toLowerCase().startsWith('fr') ? 'fr' : 'en';
}
