# api/test/

Vitest suites for the API, run against a real PostgreSQL (`TEST_DATABASE_URL`, default
`postgres://vigie:vigie@127.0.0.1:5432/vigie_test`). `global-setup.js` creates the database if
needed and resets its schema; files run sequentially and truncate tables between tests.

- `helpers.js`, `factories.js`, `http-helpers.js` – configuration, clock, event builders,
  a test app with a captured log stream, the SSO login flow.
- Unit suites: config, catalogues, sanitize/validate, auth, adapters, detectors, scenario…
- Integration suites: store, incidents service, insights service, jobs, HTTP (public and
  operator routes), seed, entry points, and the repository check script.

Nothing here reads a developer `.env`. `npm run coverage` fails under 100 %.
