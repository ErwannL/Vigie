# dashboard/src/components/

Small shared components:

- `Layout.jsx` – header (brand, environment badge and selector, language, theme), navigation.
- `Gate.jsx` – screens shown without a session: signing in (animated logo), no handoff, expired, failed.
- `Logo.jsx` – the Vigie logo (watchtower + telemetry waves): static, hover or loop; still under
  `prefers-reduced-motion`. Same drawing as `public/favicon.svg` and `public/logo-animated.svg`.
- `Brand.jsx` – « Vigie by Orqea », credits (Orqea, Erwann Laplante), « ← Back to Orqea » (URL from
  `/api/healthz`, `VIGIE_ORQEA_URL`), loader and the branded 404 (any path but `/`).
- `Status.jsx` – `Loading`, `ErrorMessage` (translated error code), `Loadable`, `NoAnalytics`.
- `BarList.jsx` – accessible horizontal bars; masked values show "< 10" without a bar.
- `Select.jsx` – labelled select.
