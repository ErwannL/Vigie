# api/src/adapters/logs/

`LogsSource.query({ from, to, route?, level? }) → [{ ts, level, route, durationMs, status, msgKind }]`

- `fake.js` – filters fixture lines (`api/fixtures/<env>.json` → `logs`).
- `loki.js` – stub for Loki (`VIGIE_LOKI_URL_<ENV>`); the comment gives the LogQL query.

Used by Module 1 as supporting evidence on route incidents (lines, 5xx count, message kinds).
