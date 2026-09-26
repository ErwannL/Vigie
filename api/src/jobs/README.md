# api/src/jobs/

- `scheduler.js` – runs named jobs on **injected** timer functions (`setTimer`/`clearTimer`),
  never a bare `setInterval`; a job never overlaps itself and a failure does not stop it.
- `tasks.js` – the periodic work, looping over the three environments explicitly:
  `detect` (Module 1 detection), `pollReplays` (Figura run status), `retention` (rollups for
  yesterday and today, then deletion of raw events older than `VIGIE_RAW_RETENTION_DAYS`,
  then purge of used SSO `jti`s).
- `rollup.js` – daily aggregates (`daily_route_stats`, `daily_feature_usage`) kept after raw
  events are deleted; also the side-by-side environment comparison query.
- `runner.js` / `main.js` – the jobs process (detection every `VIGIE_DETECT_INTERVAL_SECONDS`,
  polling every 30 s, retention hourly).
