# dashboard/src/

- `main.jsx` – browser entry: wires `window` objects (fetch, location, history, storages).
- `App.jsx` – SSO handoff / stored session, theme, language, environment and page state.
- `api.js` – API client (bearer session, timeout on every call, error codes as `ApiError`).
- `sso.js` – reads and removes the `#sso=` fragment.
- `storage.js` – storage that never throws; operator session in `sessionStorage`.
- `format.js` – display helpers (a masked count is shown as "< 10").
- `context.js` – `AppContext` (`api`, `env`, `lang`, `t`) used by every page.
- `styles.css` – theme tokens (dark default, light), WCAG AA colour pairs.
- `components/`, `hooks/`, `i18n/`, `pages/` – see their READMEs.
