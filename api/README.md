# api/

The Vigie backend: one Node.js package that runs as three processes from the same image.

| Process | Entry              | Does                                                          |
| ------- | ------------------ | ------------------------------------------------------------- |
| API     | `src/main.js`      | HTTP: ingestion, GDPR, SSO, operator routes for the dashboard |
| Jobs    | `src/jobs/main.js` | detection, replay polling, rollups and retention on timers    |
| Seed    | `src/seed/cli.js`  | `npm run seed:demo`: loads the synthetic demo dataset         |

Stack: Node.js 22 (ESM, plain JavaScript), Fastify 5, PostgreSQL 16 through `pg`, pino logs,
Vitest with V8 coverage. See `../docs/DECISIONS.md` for why.

- `src/` – the code (see its README for the map).
- `test/` – Vitest suites; they need a PostgreSQL (`TEST_DATABASE_URL`, default local).
- `fixtures/` – data served by the fake Loki / Prometheus / GlitchTip sources in development.

Commands (inside the `tests` container or with a local Node 22 + PostgreSQL):
`npm test`, `npm run coverage` (fails below 100 %), `npm start`, `npm run jobs`,
`npm run migrate`, `npm run seed:demo`.
