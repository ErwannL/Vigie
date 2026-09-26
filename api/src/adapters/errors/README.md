# api/src/adapters/errors/

`ErrorsSource.issues({ from, to }) → [{ fingerprint, title, count, firstSeen, lastSeen, route? }]`

- `fake.js` – counts fixture occurrences in the window (`api/fixtures/<env>.json` → `errors`).
- `glitchtip.js` – stub for GlitchTip/Sentry (`VIGIE_ERRORS_URL_<ENV>`, `VIGIE_ERRORS_TOKEN_<ENV>`).

Module 1 turns counts into error-spike signals (`source: "errors"`), keyed by route when the
issue has one, else by fingerprint.
