# dashboard/src/pages/

One component per section; each reads `env` from the context and passes it to every API call.

- `IncidentsPage.jsx` – incident list (status filter, "run detection now"), `IncidentDetail.jsx`
  (facts, since-version marker, triggering numbers, Figura replay in dev/recette, resolve,
  history) and `ComparePanel.jsx` (one route, two environments, side by side).
- `UsagePage.jsx` – people per feature, never/rarely used, trends and lifts, accounts by
  segment, errors per segment.
- `FunnelsPage.jsx` – funnels with conversion and drop-off, split by plan or device.
- `LandingPage.jsx` – views, clicks per `data-vigie` element, new vs returning conversion.
- `PersonasPage.jsx` – preview personas derived from the selected environment, push them to
  Figura in dev or recette, history of sent sets.
- `SettingsPage.jsx` – mode, retention, k, catalogue versions, source status per environment.
- `incidentText.js`, `DaysSelect.jsx` – shared helpers.
