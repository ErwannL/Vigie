# api/fixtures/

Data for the fake pull sources (`src/adapters/*/fake.js`), one file per Orqea environment.
They are only loaded when `VIGIE_MODE=development` and the real source URL is not set.

Timestamps are written as `offsetMinutes` before "now", so the data is always recent:

- `logs`: `{ offsetMinutes, level, route, durationMs, status, msgKind }` (LogsSource)
- `metrics`: `{ route, points: [{ offsetMinutes, valueMs }] }` (MetricsSource, p95 series)
- `errors`: `{ fingerprint, title, route?, occurrences: [offsetMinutes] }` (ErrorsSource)

`prod.json` plants the same problems as the demo seed (slow `/api/boards/:boardId`, a spike
of `TypeError:card-move-null`), so pull-source signals agree with the collected events.
