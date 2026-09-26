# Decisions

Every choice this brick makes that the brief did not dictate, and why. Each is small and
reversible; the ones behind an adapter can be changed without touching the rest.

## Stack

**Node.js 22 + plain JavaScript (ESM).** Same runtime as Orqea's backend, so the integrator
reads familiar code; the brief names the stubs `loki.js`, `prometheus.js`, `glitchtip.js`.
No TypeScript build step: JSDoc and tests document the shapes. Node 22's `fetch` and
`AbortSignal.timeout` give HTTP timeouts without a library.

**Fastify 5** for HTTP: fast JSON handling for batch ingestion, per-route body limits
(1 MB on `/v1/events`, 64 KB elsewhere), `inject()` for tests without a socket, pino logs.

**PostgreSQL 16** for storage. Why it suits high-volume, time-based, per-environment events:

- The `events` table is **declaratively LIST-partitioned by `env`**: `events_dev`,
  `events_recette`, `events_prod` are physically separate tables, so a prod query never scans
  dev data, and each partition can be vacuumed, sized or moved on its own.
- Every index starts with `env` then `occurred_at` (`(env, occurred_at)`,
  `(env, type, occurred_at)`, `(env, route, occurred_at)`…), which matches every query
  shape: one environment, one time window.
- Analytics run in SQL (`percentile_cont`, `FILTER`, `GROUPING SETS`, window functions for
  rage clicks), so only aggregates leave the database.
- Retention is a range delete per environment; daily rollups keep long-term trends small.
- Idempotency is a primary key `(env, event_id)` with `ON CONFLICT DO NOTHING`.
- One well-known, transactional store for events, incidents, audit log and SSO `jti`s is far
  simpler to operate than two. At a much larger scale the next steps are, in order: time
  sub-partitions per month (drop instead of delete), BRIN indexes, then moving raw events
  to a columnar store (ClickHouse/TimescaleDB) behind `store/events.js`.

**Environment separation: an `env` column everywhere (with CHECK constraints), plus
partitions for events**, rather than one schema per environment. It keeps one set of
migrations and one query path, makes explicit side-by-side comparison possible with a single
query, and the partitioning gives physical separation where the volume is. Mixing by
accident is prevented in code: every repository and insight function calls `assertEnv`
first, and there is no function without an env parameter.

**React 19 + Vite** for the dashboard, served by **nginx** (unprivileged image) which also
proxies `/api` to the API. Same origin for the SPA and its API: no CORS, and no
third-party-cookie issue inside the admin console's iframe. Charts are simple accessible bars
in HTML/CSS (no chart library to keep, theme, and test).

**Vitest + V8 coverage** for both packages (one test tool); thresholds 100 % on statements,
branches, functions and lines, and the command fails below. **ESLint 10 + Prettier 3**, zero
warnings. `scripts/check.js` enforces what linters do not (file length, LF, README per
folder, no skipped tests or coverage escapes); it is itself tested and covered.

## Contracts and security

- **Accepted count includes duplicates.** A retried batch answers `accepted: n` again (the
  events are accepted, just not stored twice); the contract only has `accepted` and
  `rejected`.
- **Unknown fields are rejected** at every level (not ignored): the only way to guarantee no
  free text is stored.
- **`occurredAt` window**: up to 5 minutes in the future (clock skew), not older than the raw
  retention (it would be deleted at once).
- **Opaque id format** `[A-Za-z0-9_-]{8,128}`: fits base64url HMACs; excludes emails and IPs
  by construction.
- **Essential consent keeps `session`, `plan`, `device`, `appVersion`, `page`.** They are
  needed for Module 1: session links an error to the exit after it; plan/device say who is
  affected; appVersion powers "since version" and reopening. `user` is dropped too
  (not strictly needed for incidents).
- **GDPR endpoints are scoped to the credential's environment**, like ingestion: one
  credential never reaches another environment's data. Orqea calls each environment.
- **Operator session is a bearer token**, not a cookie: cookies in a cross-site iframe are
  third-party cookies, increasingly blocked. The dashboard keeps it in memory and
  `sessionStorage` (survives an iframe reload, not the tab). Stateless HMAC token, 30 minutes
  by default; SSO `jti`s are stored until expiry to enforce single use.
- **`/readyz` and `/v1/subjects` are also outside the operator session** (the brief lists
  `/auth/sso`, `/v1/events`, `/healthz`): readiness probes carry no credentials, and subjects
  use the ingestion bearer as the brief specifies. `/v1/catalogues` requires the session;
  Orqea can read the catalogues from `api/src/catalogues.js`.
- **CSP keywords**: `VIGIE_ALLOWED_FRAME_ANCESTORS` accepts `self`/`none` without quotes
  (quotes are fragile in env files); the API and nginx apply the same conversion.
- **Secrets validation at start**: identical SSO and session secrets stop the process;
  a short secret is treated as absent (feature disabled with a 503 or 401), never as valid.
- **`production` is the default mode**: without `VIGIE_MODE=development`, missing adapters
  are disabled instead of faked, so a misconfigured deployment cannot show fake data.

## Module 1 (incidents)

- **Windows**: current = last `VIGIE_DETECT_WINDOW_MINUTES` (60); baseline = the preceding
  `VIGIE_DETECT_BASELINE_DAYS` (7). Funnels use the last day vs the 7 days before (a
  one-hour funnel has too few people). Detection runs every 5 minutes.
- **Thresholds** (in `detect.js`, stored with each signal):
  latency p95 ≥ 1.5× baseline **and** +100 ms, ≥ 30 samples on both sides (3 points for
  metric series); error spike ≥ 10 errors **and** ≥ 3× the baseline rate scaled to the
  window (floor: 1 expected); funnel drop ≥ 10 points **and** ≥ 25 % relative, ≥ 30 entrants;
  rage click = 4 clicks on the same element within 10 s, ≥ 5 sessions; quick exit = last event
  of the session ≤ 30 s after an error, ≥ 5 sessions and ≥ 50 % of error sessions.
- **Severity**: latency ratio ≥ 2 medium, ≥ 3 high; errors ratio ≥ 5 medium, ≥ 10 or ≥ 100
  errors high; funnels relative drop ≥ 35 % medium, ≥ 50 % high; rage/exits ≥ 20 sessions
  medium, ≥ 50 high. An incident keeps its worst severity.
- **Correlation key**: route template first, then error fingerprint, then page + element,
  then funnel step. An error with a route merges with that route's latency signal. An active
  incident is updated if its last signal is less than 24 h old; otherwise a new one opens.
- **Pull sources**: metrics give a second latency signal (mean of the p95 points per window);
  the error tracker a second error signal; logs are attached as evidence (lines, 5xx count,
  message kinds) rather than as a detector, since collected events already carry latency.
- **Affected segments**: device and plan shares among the incident's events in the window
  (top 3 each); the dashboard says "mostly X" for shares ≥ 50 %. Features ≥ 10 % share.
- **Version marker**: `appVersion` is the newest version seen in the window; `sinceVersion`
  is the first version seen in the window that never appeared in the baseline (null when the
  baseline has no version at all).
- **Lifecycle**: `open → reproducing → confirmed | not_reproduced → resolved`, `resolved →
reopened` only when the signal returns with an `appVersion` different from the one at
  resolution; a return on the same version is recorded in history
  (`seen_before_new_version`) and the incident stays resolved. A **failed** Figura run
  returns the incident to its status before the replay. Replay is allowed from `open`,
  `reopened`, `confirmed`, `not_reproduced` (re-run).
- **Scenario path**: last 4 distinct steps before the first hit, per session, over up to 500
  sessions; the most frequent path shared by **≥ 5 sessions** wins (ties: longer, then
  alphabetical). Fallback: visit the incident's page (or `/`). The expectation is the
  baseline p95 for latency incidents, `status: 200` otherwise.
- **Auto replay**: `VIGIE_AUTO_REPLAY_TARGET` (dev|recette) replays new and reopened
  incidents; empty means the operator decides.
- **Issue sink failures** are logged and retried at the next change; detection never fails
  because of the sink.

## Module 2 (insights)

- **Behavioural insights use `analytics` consent events only**, and return
  `analytics.hasData = false` with no numbers when there are none in the window.
  "Errors per segment" uses all events (plan and device survive essential consent).
- **k = 10 counts people**: distinct users (or visitors for anonymous landing data). For
  errors per segment, sessions stand in for people. Rates are `null` when the denominator is
  below k.
- **"Rarely used"**: used by < 5 % of active people, or by fewer than k people. "Never used":
  no `feature_use` in the window.
- **Trend**: weekly active people in the last 7 days vs the 7 days before (null below k).
- **Retention/upgrade lift**: among signed-in people active in the window, retention = active
  in the last 7 days given active before; lift = rate(users of the feature) − rate(others).
  A correlation, labelled as such, not a causal claim.
- **Landing split**: "returning account" = a visitor who logged in and did not sign up in
  the window; everyone else is a new visitor.
- **Funnels** are computed per visitor in application code from ordered events (clear and
  exact at this scale; materialise if volume requires). Split by plan or device uses the
  visitor's last known value.
- **Segments** take each account's latest plan/seats/age in the window; activity from its
  distinct active days in the window.
- **Personas**: one per (plan, device) group with ≥ 10 people; session attributes use the
  session's dominant device and plan; feature weights count only `feature_use` events;
  drop-offs come from visitors whose events carry that plan and device, so pre-signup steps
  are biased towards people who did sign up (documented, and fine for driving Figura).
- **Window** parameter: 1–90 days, default 28.

## Operations

- **Fakes are stateless across processes**: the fake Figura encodes its outcome and start
  time in the run id, the fake issue sink derives refs from the incident. The API starts
  replays and the jobs process polls them; in-memory fakes would disagree (found by running
  the demo in Docker, where the replay could never settle).
- **Three processes, one image**: API, jobs, seed. Jobs are a separate process so the API
  can scale horizontally without running detection several times.
- **Timers are injected** (`createScheduler({ setTimer, clearTimer })`); a job is
  re-armed only after it finishes (no overlap). Retention runs hourly (idempotent).
- **Migrations** are plain SQL run at API and jobs start, one transaction per file.
- **Demo seed** is deterministic (seeded PRNG) and goes through the real validation, so it
  also proves the collector accepts realistic traffic. Planted problems are in the last hour
  (latency, errors, rage) and last day (funnel) relative to when the seed runs, so run
  detection soon after seeding (the seed runs one pass itself).
- **Tests use a real PostgreSQL** (the SQL is the logic); files run sequentially on one test
  database whose schema is reset at start. Only `TEST_DATABASE_URL` is read from outside.
- **Language default**: the browser language (French if it starts with `fr`), then remembered.

## Verified by breaking the code

Each key rule was broken on purpose, its test suite run, then the code restored. All went red.
Two mutations first **survived** and led to changes: the all-digits check in `sanitize.js`
was dead code (a route word must already start with a letter) and was deleted; a duplicate
`assertEnv` in the insights service made the repository guard untestable and was removed
(the repository guard is the one that counts).

| Rule broken                                | Where                       | Suite that went red          |
| ------------------------------------------ | --------------------------- | ---------------------------- |
| Figura refuses prod                        | `adapters/figura/client.js` | `adapters.test.js`           |
| secrets < 32 chars are absent              | `config.js`                 | `config.test.js`             |
| the matched secret decides the environment | `auth/ingest.js`            | `http-public.test.js`        |
| essential consent drops the visitor id     | `collector/validate.js`     | `validate.test.js`           |
| hex ids rejected in templates              | `collector/sanitize.js`     | `sanitize.test.js`           |
| k-anonymity threshold 10                   | `insights/kanon.js`         | `insights-units.test.js`     |
| ingestion idempotent on eventId            | `store/events.js`           | `store.test.js`              |
| SSO `jti` single use                       | `http/routes/public.js`     | `http-public.test.js`        |
| `frame-ancestors` from configuration       | `http/app.js`               | `http-public.test.js`        |
| scenario path shared by ≥ 5 sessions       | `incidents/scenario.js`     | `incidents-scenario.test.js` |
| retention deletes old raw events           | `jobs/tasks.js`             | `jobs.test.js`               |
| reopen only after a new app version        | `incidents/detection.js`    | `incidents-service.test.js`  |
| env required by every insight              | `store/events.js`           | `insights-service.test.js`   |
| persona weights from `feature_use` only    | `insights/personas.js`      | `insights-service.test.js`   |
| dashboard removes the `#sso` fragment      | `dashboard/src/sso.js`      | `core.test.js`               |
| dashboard shows masked counts as "< 10"    | `dashboard/src/format.js`   | `core.test.js`               |
| dashboard maps error codes to translations | `components/Status.jsx`     | `incidents.test.jsx`         |
