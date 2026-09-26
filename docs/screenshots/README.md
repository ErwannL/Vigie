# docs/screenshots/

The dashboard with the demo dataset, taken by a headless Chromium through a fake admin
console page that embeds Vigie in a 1024 px `<iframe>` and hands off a real `#sso=` token.

- `incidents.png` – prod incidents: the four planted problems, "mostly mobile, free".
- `incident-detail.png` – slow route: "since version 2.4.0", triggering numbers from events,
  metrics and logs, replay reproduced in recette (polled by the jobs process).
- `usage.png` – people per feature, never and rarely used features.
- `funnels.png` – activation and upgrade funnels.
- `dev-no-analytics.png` – dev only has essential-consent events: the explicit empty state.
- `personas.png` – personas derived from prod for Figura.
- `settings-light-fr.png` – light theme, French, source status per environment.

The same run checked that the `#sso` fragment is removed, that an origin not listed in
`VIGIE_ALLOWED_FRAME_ANCESTORS` cannot frame the dashboard, and that without a handoff the
explanation screen is shown.
