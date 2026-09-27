# dashboard/

The operator dashboard: a React 19 single-page app built by Vite and served by nginx, meant
to be embedded in the Orqea admin console in an `<iframe>` (works at 1024 px wide).

- No login screen and no user table: the admin console opens it with `#sso=<jwt>`; the app
  removes the fragment immediately, exchanges it at `POST /api/auth/sso`, and keeps Vigie's
  bearer session in memory and `sessionStorage` (no cookie: works in a cross-site iframe).
  Without a valid handoff it explains how to get in.
- Branding like the other Orqea companion apps: « Vigie by Orqea », animated-logo loader and
  favicon, credits, « ← Retour sur Orqea » (`VIGIE_ORQEA_URL` via `/api/healthz`), branded 404.
- The environment selector is always visible, with a coloured badge (prod is red).
- Pages: Incidents (list, detail with triggers and replay, env comparison), Usage (features,
  segments, errors per segment, never-used features), Funnels, Landing, Personas, Settings.
- Dark theme by default, light theme available; colours meet WCAG AA (see `src/styles.css`).
- English and French: every visible string has a key in `src/i18n/en.js` and `fr.js`
  (a test checks both have the same keys and that every key used in the code exists).
  Server error codes are mapped to keys, never shown raw.

`nginx/` holds the server config: same-origin proxy `/api/ → api:3000`, CSP with
`frame-ancestors` from `VIGIE_ALLOWED_FRAME_ANCESTORS`.

Commands: `npm run dev` (Vite on 5173, proxies `/api` to localhost:3000), `npm run build`,
`npm test`, `npm run coverage` (fails below 100 %).
