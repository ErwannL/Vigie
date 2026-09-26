# api/src/adapters/errors/

`ErrorsSource.issues({ from, to }) → [{ fingerprint, title, count, firstSeen, lastSeen, route? }]`

- `fake.js` – counts fixture occurrences in the window (`api/fixtures/<env>.json` → `errors`).
- `glitchtip.js` – Sentry-compatible issues API (`VIGIE_ERRORS_URL_<ENV>` base URL,
  `VIGIE_ERRORS_TOKEN_<ENV>` bearer, `VIGIE_ERRORS_PROJECT_<ENV>` = `org/project`). `route`
  only when `culprit` is a route template.

Module 1 turns counts into error-spike signals (`source: "errors"`), keyed by route when the
issue has one, else by fingerprint.
