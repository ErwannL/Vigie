# api/src/adapters/logs/

`LogsSource.query({ from, to, route?, level? }) → [{ ts, level, route, durationMs, status, msgKind }]`

- `fake.js` – filters fixture lines (`api/fixtures/<env>.json` → `logs`).
- `loki.js` – Loki `query_range` (`VIGIE_LOKI_URL_<ENV>`, selector `VIGIE_LOKI_SELECTOR`,
  default `{container=~".*backend.*"}`), then `| json` and optional route/level filters.
  `msgKind` = field `msgKind` or `event`, never the message text.

Used by Module 1 as supporting evidence on route incidents (lines, 5xx count, message kinds).
