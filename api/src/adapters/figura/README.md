# api/src/adapters/figura/

`FiguraClient`: `replay(scenario) → { runId }`, `status(runId) → { state, evidence }`,
`pushPersonas(set) → { accepted }`.

- `client.js` – the only entry point. Refuses any `targetEnv` other than `dev`/`recette`
  (error `figura_target_forbidden`) before reaching an implementation, and prefixes run ids
  with their target (`recette:abc`) so `status` knows where to ask.
- `fake.js` – **stateless** runs: the outcome of `decide()` (default `reproduced`), the start
  time and the step count are encoded in the run id, so the API process (which starts runs)
  and the jobs process (which polls them) agree. A run is `running` for 20 s, then settles.
- `figura.js` – HTTP client for one target (`VIGIE_FIGURA_URL_DEV|RECETTE`, bearer
  `VIGIE_FIGURA_TOKEN_DEV|RECETTE` ≥ 32 chars): `POST /api/vigie/replays`,
  `GET /api/vigie/replays/{runId}`, `POST /api/vigie/personas`. Unknown `state` is refused.

Scenario and PersonaSet formats: `docs/CONTRACT.md` §4.
