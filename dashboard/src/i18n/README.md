# dashboard/src/i18n/

- `en.js`, `fr.js` – flat dictionaries `key → text`, with `{name}` placeholders.
- `index.js` – `translate(lang, key, vars)`, `errorKey(code)` (server code → `errors.*` key,
  unknown codes → `errors.unknown`), `initialLanguage(stored, navigatorLanguage)`.

Tests enforce: identical key sets in both languages, no empty string, every literal key used
in `src/` exists, and every error code the API can return has a translation.
To add a language: add a dictionary, list it in `LANGUAGES`, add `lang.<code>` to each file.
