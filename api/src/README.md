# api/src/

| Path                   | Role                                                                 |
| ---------------------- | -------------------------------------------------------------------- |
| `main.js`, `server.js` | API process: migrate, listen, stop on SIGTERM                        |
| `container.js`         | builds every component from environment variables (one wiring place) |
| `config.js`            | reads and validates all `VIGIE_*` variables (pure)                   |
| `env.js`               | the three environments; guards (`assertEnv`, `assertFiguraTarget`)   |
| `catalogues.js`        | event types, features, funnels, segments, k-anonymity (versioned)    |
| `errors.js`            | `AppError` (stable codes) and `NotImplementedError`                  |
| `collector/`           | event validation, pseudonymisation rules, batch ingestion            |
| `auth/`                | ingestion bearer, SSO JWT verification, operator sessions            |
| `store/`               | PostgreSQL pool, migrations, repositories (env-scoped)               |
| `adapters/`            | studs to the outside: interfaces, fakes, real stubs, registry        |
| `modules/incidents/`   | Module 1: detect, correlate, reproduce, report                       |
| `modules/insights/`    | Module 2: usage, landing, funnels, segments, personas                |
| `jobs/`                | scheduler with injectable timers, rollups, retention                 |
| `http/`                | Fastify app, security headers, routes                                |
| `seed/`                | deterministic demo dataset generator                                 |

Rule of thumb: every function that reads or writes data takes the environment first and
calls `assertEnv` — there is no code path that reads "all environments" at once.
