# api/src/modules/incidents/

Pipeline for one environment (`service.runDetection(env)`):

1. `signals.js` – collect signals: SQL on collected events (`queries.js`) plus the metrics and
   errors pull sources; a failing source is reported, never fatal.
2. `detect.js` – pure detectors with explicit thresholds: latency regression (p95 vs baseline,
   minimum samples), error spikes (baseline scaled to the window), funnel drops, rage clicks,
   quick exits after an error. Each signal carries the numbers that triggered it.
3. `correlate.js` – group signals by key (route → fingerprint → element → funnel step).
4. `detection.js` – enrich (who is affected: device/plan shares, features, `appVersion`,
   "since version" marker, log evidence) and upsert against the latest incident with that key:
   update, reopen after a new version, or open.
5. `reporter.js` / `report.js` – open or update the issue through `IssueSink`.

Reproduction (`replay.js`): `scenario.js` builds a Figura scenario from the **most common
path shared by at least 5 sessions** (never one user's trail), only from templates and
catalogue keys; the target (dev/recette) is chosen by the operator or `VIGIE_AUTO_REPLAY_TARGET`.
`lifecycle.js` holds the status machine:
`open → reproducing → confirmed | not_reproduced → resolved`, `resolved → reopened`.
