# api/src/seed/

`npm run seed:demo` (`cli.js` → `run.js`) fills the database with a deterministic synthetic dataset so
the dashboard and both modules can be demonstrated with no real system connected.

- `random.js` – seeded PRNG helpers (same data on every run).
- `generate.js` – visitor journeys: landing, signup funnel, existing accounts with activity
  levels, app sessions with features, paywalls, upgrades, API calls, rare errors.
- `plants.js` – the planted problems in **prod** (last hour, app version `2.4.0`):
  slow `/api/boards/:boardId` (mostly mobile/free), error spike `TypeError:card-move-null`
  with quick exits, rage clicks on `card.save`, and a signup funnel drop over the last day.
  Recette is healthy (for the prod vs recette comparison); dev only has essential events
  (shows the "no analytics consent data yet" state).
- `demo.js` – ingests through the real collector (every event is validated), rolls up and runs
  one detection pass per environment.

`VIGIE_SEED_SCALE` multiplies the size (1 ≈ 3,400 visitors, 140k events).
