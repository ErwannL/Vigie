# api/src/modules/insights/

Module 2. `service.js` exposes `usage`, `landing`, `funnels`, `segments`, `errors`,
`previewPersonas`, `pushPersonas`; each takes a required environment and a window in days.

- Behavioural insights only read `consent = 'analytics'` events. With none in the window
  they return `analytics.hasData = false` and no numbers.
- `kanon.js` – k-anonymity (k = 10) applied **here, server side**: people counts below k
  become `{ value: null, masked: true }`, and rates over fewer than k people are `null`.
- `usage.js` – people per feature (daily, weekly, trend), share per plan, never/rarely used
  features, retention and upgrade lift of users vs non-users of each feature.
- `landing.js` – landing views, clicks per `data-vigie` element, conversion into signup /
  login, new visitors vs returning accounts.
- `funnels.js` – catalogue funnels (ordered steps, time-gated day-7 return), optionally per
  plan or device; also feeds Module 1's funnel-drop detector.
- `segments.js` – accounts by plan × seats × tenure × activity (no id is ever selected).
- `errors.js` – errors experienced per plan and device (works with essential events).
- `personas.js` – derives a `PersonaSet` per (plan, device) group of ≥ k people.
