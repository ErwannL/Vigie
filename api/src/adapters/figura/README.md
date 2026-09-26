# api/src/adapters/figura/

`FiguraClient`: `replay(scenario) → { runId }`, `status(runId) → { state, evidence }`,
`pushPersonas(set) → { accepted }`.

- `client.js` – the only entry point. Refuses any `targetEnv` other than `dev`/`recette`
  (error `figura_target_forbidden`) before reaching an implementation, and prefixes run ids
  with their target (`recette:abc`) so `status` knows where to ask.
- `fake.js` – in-memory runs: `running` on the first poll, then the outcome of `decide()`
  (default `reproduced`). Keeps pushed persona sets for inspection.
- `figura.js` – stub of the HTTP client for one target (`VIGIE_FIGURA_URL_DEV|RECETTE`).

Scenario and PersonaSet formats: `docs/CONTRACT.md` §4.3.
