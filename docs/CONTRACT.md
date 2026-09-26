# Vigie contract

The only shared surface between Vigie and the systems around it. Everything here is
implemented and tested in this repository; the other side (Orqea, Figura, observability) can
be built from this document alone.

- All JSON, UTF-8. Timestamps are ISO-8601 UTC (`2026-09-01T12:00:00.000Z`).
- Every error response is `{ "error": "<code>" }` with a stable code (table in §9). Messages
  are never returned.
- Environments are `dev`, `recette`, `prod`. Every stored record carries one; every read
  takes one.

Contents: [§1 Ingestion](#1-event-ingestion-post-v1events) ·
[§2 GDPR](#2-subjects-gdpr) · [§3 Pull adapters](#3-pull-adapters-observability) ·
[§4 Figura](#4-figura-adapter) · [§5 Issue sink](#5-issue-sink-output-to-orqea) ·
[§6 Catalogues](#6-catalogues) · [§7 SSO](#7-dashboard-single-sign-on) ·
[§8 Operator API](#8-operator-api-used-by-the-dashboard) · [§9 Error codes](#9-error-codes) ·
[§10 Health](#10-health)

---

## 1. Event ingestion: `POST /v1/events`

Called **only by Orqea's backend**, server to server. Browsers send their events to Orqea,
which forwards them (same-origin for the browser, secret never in the browser).

### Request

```http
POST /v1/events HTTP/1.1
Authorization: Bearer <VIGIE_INGEST_SECRET_PROD>
Content-Type: application/json

{ "events": [ Event, … ] }
```

- One secret per environment: `VIGIE_INGEST_SECRET_DEV`, `_RECETTE`, `_PROD`, each ≥ 32
  characters (a shorter secret counts as absent: every call gets `401`). Comparison is constant
  time. **The matched secret decides the environment**; the event's `env` field must equal it.
- At most **500 events** and **1 MB** per request.
- `Content-Type: application/json` is required.

### Response

```http
HTTP/1.1 202 Accepted

{ "accepted": 1, "rejected": [ { "index": 1, "code": "env_mismatch" } ] }
```

- `accepted`: events that are valid, **including already-stored duplicates**.
- `rejected`: index in the batch and a code (table below). One bad event never rejects the
  batch.
- Idempotent on `eventId` within an environment: retrying a batch never double-counts.

| Status | Body                     | When                                        |
| ------ | ------------------------ | ------------------------------------------- |
| 202    | `{ accepted, rejected }` | batch processed (even if all were rejected) |
| 400    | `invalid_batch`          | body is not `{ "events": [...] }`           |
| 400    | `too_many_events`        | more than 500 events                        |
| 400    | `invalid_request`        | malformed JSON                              |
| 401    | `unauthorized`           | missing, unknown or too-short bearer        |
| 413    | `payload_too_large`      | body over 1 MB                              |
| 415    | `unsupported_media_type` | not JSON                                    |

### `Event` (schema 1)

```json
{
  "schema": 1,
  "env": "prod",
  "eventId": "0f8fad5b-d9cb-469f-a165-70867728950e",
  "occurredAt": "2026-09-01T11:59:03.120Z",
  "source": "app",
  "type": "api_request",
  "visitor": "v_9f86d081884c7d65",
  "session": "s_2c26b46b68ffc68f",
  "user": "u_fcde2b2edba56bf4",
  "account": { "plan": "free", "seats": 1, "ageDays": 42, "segment": "smb" },
  "context": {
    "country": "FR",
    "locale": "fr",
    "device": "mobile",
    "theme": "dark",
    "appVersion": "2.4.0"
  },
  "target": { "page": "/board/:boardId", "element": "card.save", "feature": "card.move" },
  "perf": { "durationMs": 1830, "status": 200, "route": "/api/boards/:boardId" },
  "error": {
    "kind": "TypeError",
    "fingerprint": "TypeError:card-move-null",
    "message": "card is null"
  },
  "consent": "analytics"
}
```

| Field                | Rule                                                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema`             | must be `1`                                                                                                                                                          |
| `env`                | `dev`/`recette`/`prod`, must equal the credential's environment                                                                                                      |
| `eventId`            | UUID (case-insensitive, stored lowercase)                                                                                                                            |
| `occurredAt`         | ISO-8601 **UTC** (`Z`); not more than 5 min in the future, not older than the retention                                                                              |
| `source`             | `landing` · `app` · `backend` · `auth`                                                                                                                               |
| `type`               | `page_view` · `click` · `signup` · `login` · `login_failed` · `logout` · `feature_use` · `api_request` · `client_error` · `server_error` · `paywall_hit` · `upgrade` |
| `visitor`            | optional; opaque id `[A-Za-z0-9_-]{8,128}` (Orqea's HMAC, **never a raw IP**)                                                                                        |
| `session`            | optional; opaque id, same pattern                                                                                                                                    |
| `user`               | optional or `null` (anonymous); opaque pseudonymous id, same pattern                                                                                                 |
| `account.plan`       | `free` · `pro` · `team` · `enterprise` · `null`                                                                                                                      |
| `account.seats`      | integer 1 … 1,000,000                                                                                                                                                |
| `account.ageDays`    | integer ≥ 0                                                                                                                                                          |
| `account.segment`    | optional `[a-z0-9_.-]{1,40}`                                                                                                                                         |
| `context.country`    | ISO 3166 alpha-2 (`FR`)                                                                                                                                              |
| `context.locale`     | `fr` or `fr-FR`                                                                                                                                                      |
| `context.device`     | `desktop` · `mobile` · `tablet`                                                                                                                                      |
| `context.theme`      | `dark` · `light`                                                                                                                                                     |
| `context.appVersion` | `x.y.z` with optional `-prerelease`                                                                                                                                  |
| `target.page`        | **route template** (see below)                                                                                                                                       |
| `target.element`     | stable `data-vigie` id `[a-z][a-z0-9_.-]{0,63}` (never a label or button text)                                                                                       |
| `target.feature`     | catalogue key (§6)                                                                                                                                                   |
| `perf.durationMs`    | integer 0 … 3,600,000                                                                                                                                                |
| `perf.status`        | integer 100 … 599                                                                                                                                                    |
| `perf.route`         | **route template** (Express route, e.g. `/api/boards/:boardId`)                                                                                                      |
| `error.kind`         | `[A-Za-z0-9_.:-]{1,64}`                                                                                                                                              |
| `error.fingerprint`  | `[A-Za-z0-9_.:-]{1,128}`                                                                                                                                             |
| `error.message`      | ≤ 300 chars, **sanitised**: no email, IP, UUID, 6+ digit number, JWT, bearer/token/password words, URL with query, long opaque string                                |
| `consent`            | `essential` · `analytics`                                                                                                                                            |

Any other field, at any level, is rejected (`unknown_field`, `unknown_field_<section>`):
there is no place for card content, form values, input values or button text.

**Templates.** `/`-separated lowercase words or `:params`: `/board/:boardId`,
`/api/cards/:cardId/move`, `/settings/billing`, `/`. Rejected: raw ids (`/board/42`,
`/board/3f2c…`, hex ≥ 12 chars, words with ≥ 4 digits, long tokens), emails, query strings,
fragments, full URLs, uppercase words, trailing slashes.

**Consent.** Decided by Orqea. Until Orqea ships its consent banner every event is
`essential`, and Vigie's Module 1 works fully with those. For `essential` events Vigie
**drops** `visitor`, `user`, `target.element`, `target.feature`, `account.seats`,
`account.ageDays`, `account.segment`, `context.country`, `context.locale`, `context.theme`
before storage. It keeps what incidents need: `session`, `account.plan`, `context.device`,
`context.appVersion`, `target.page`, `perf.*`, `error.*`.

### Rejection codes

`invalid_event`, `unknown_field`, `unknown_field_account|context|target|perf|error`,
`invalid_account|context|target|perf|error` (section not an object), `unsupported_schema`,
`env_mismatch`, `invalid_event_id`, `invalid_occurred_at`, `occurred_at_in_future`,
`occurred_at_too_old`, `invalid_source`, `unknown_type`, `invalid_consent`, `invalid_visitor`,
`invalid_session`, `invalid_user`, `invalid_plan`, `invalid_seats`, `invalid_age_days`,
`invalid_segment`, `invalid_country`, `invalid_locale`, `invalid_device`, `invalid_theme`,
`invalid_app_version`, `page_not_template`, `invalid_element`, `unknown_feature`,
`invalid_duration`, `invalid_status`, `route_not_template`, `invalid_error_kind`,
`invalid_error_fingerprint`, `invalid_error_message`, `unsanitised_error_message`.

### Example

```bash
curl -s -X POST http://localhost:3000/v1/events \
  -H "Authorization: Bearer $VIGIE_INGEST_SECRET_PROD" -H 'Content-Type: application/json' \
  -d '{"events":[{"schema":1,"env":"prod","eventId":"0f8fad5b-d9cb-469f-a165-70867728950e",
       "occurredAt":"2026-09-01T11:59:03.120Z","source":"backend","type":"api_request",
       "session":"s_2c26b46b68ffc68f","account":{"plan":"free"},"context":{"device":"mobile",
       "appVersion":"2.4.0"},"perf":{"durationMs":1830,"status":200,
       "route":"/api/boards/:boardId"},"consent":"essential"}]}'
# → 202 {"accepted":1,"rejected":[]}
```

---

## 2. Subjects (GDPR)

Same bearer as ingestion; scoped to **that credential's environment** (call it once per
environment). `:user` is the pseudonymous `user` id.

| Request                     | Response                                                |
| --------------------------- | ------------------------------------------------------- |
| `GET /v1/subjects/:user`    | `200 { env, user, events: [ …stored rows… ] }` (export) |
| `DELETE /v1/subjects/:user` | `200 { env, user, deleted: <n> }` (erasure)             |

Both are idempotent (a second `DELETE` returns `deleted: 0`). Errors: `401 unauthorized`,
`400 invalid_user` (not an opaque id). Aggregates and incidents never contain user ids.

---

## 3. Pull adapters (observability)

Interfaces Vigie calls; the integrator writes the real implementations
(`api/src/adapters/*/loki.js`, `prometheus.js`, `glitchtip.js`). All calls go through
`fetchJson` with a timeout (`VIGIE_HTTP_TIMEOUT_MS`, default 5000).

```text
LogsSource.query({ from: Date, to: Date, route?: string, level?: string })
  → [{ ts: ISO, level: string, route: template, durationMs: number, status: number, msgKind: string }]

MetricsSource.latency({ from: Date, to: Date, route?: template, quantile: 0.95 })
  → [{ route: template, ts: ISO, valueMs: number }]

ErrorsSource.issues({ from: Date, to: Date })
  → [{ fingerprint: string, title: string, count: number, firstSeen: ISO, lastSeen: ISO, route?: template|null }]
```

Configuration, one per Orqea environment (`<ENV>` = `DEV`, `RECETTE`, `PROD`):
`VIGIE_LOKI_URL_<ENV>`, `VIGIE_PROMETHEUS_URL_<ENV>`, `VIGIE_ERRORS_URL_<ENV>`,
`VIGIE_ERRORS_TOKEN_<ENV>`. Unset → fake (fixtures) when `VIGIE_MODE=development`, disabled
("not configured") otherwise. A source that throws is reported in the detection result
(`sourceErrors`) and never stops detection.

---

## 4. Figura adapter

```text
FiguraClient.replay(scenario)   → { runId }
FiguraClient.status(runId)      → { state: "queued"|"running"|"reproduced"|"not_reproduced"|"failed", evidence }
FiguraClient.pushPersonas(set)  → { accepted }
```

- One Figura endpoint per **target**: `VIGIE_FIGURA_URL_DEV`, `VIGIE_FIGURA_URL_RECETTE`.
- 🔴 **Figura never runs against prod.** `targetEnv` must be `dev` or `recette`; anything
  else fails with `figura_target_forbidden` _before_ any call. No setting can change this.
- **Source and target are independent**: data from any environment (usually prod) can become
  a scenario or a persona set run in dev or recette. Both record `sourceEnv` and `targetEnv`.
- Vigie prefixes run ids with the target (`recette:<figura run id>`); Figura only ever sees
  its own id.

### Scenario (schema 1)

Built only from route templates and catalogue keys, from the most common navigation path
shared by at least 5 sessions (never one user's trail). The last step carries the
expectation (for a latency incident: the baseline p95).

```json
{
  "schema": 1,
  "kind": "vigie.scenario",
  "incidentId": 1,
  "sourceEnv": "prod",
  "targetEnv": "recette",
  "persona": { "plan": "free", "device": "mobile", "locale": "en" },
  "steps": [
    { "action": "login", "target": null },
    { "action": "visit", "target": "/boards" },
    {
      "action": "visit",
      "target": "/board/:boardId",
      "expect": { "maxDurationMs": 340, "status": 200 }
    }
  ],
  "watch": { "routes": ["/api/boards/:boardId"], "fingerprints": [] },
  "basis": { "pathSessions": 331 }
}
```

`action` ∈ `visit` (target: page template) · `click` (target: `data-vigie` id) · `signup` ·
`login` (target: `null`) · `use_feature` (target: feature key) · `wait`.
`expect` ⊂ `{ maxDurationMs?, status? }`. `watch` lists what Figura should measure.

### PersonaSet (schema 1)

One persona per (plan, device) group with at least k = 10 people in the source window.

```json
{
  "schema": 1,
  "kind": "vigie.persona_set",
  "sourceEnv": "prod",
  "targetEnv": "recette",
  "window": { "from": "2026-08-29T12:55:26.406Z", "to": "2026-09-26T12:55:26.406Z", "days": 28 },
  "personas": [
    {
      "name": "free-desktop",
      "traits": { "plan": "free", "device": "desktop", "locale": "fr" },
      "weights": {
        "features": { "card.create": 0.681, "card.move": 0.559, "list.create": 0.282 },
        "sessionLength": { "medianEvents": 10.5, "medianMinutes": 3.392 },
        "dropOff": {
          "activation": {
            "signup_start": 0.516,
            "signup_done": 0,
            "first_board": 0.318,
            "first_card": 0.129,
            "day7_return": 0.673
          },
          "upgrade": { "upgrade": 0.827 }
        }
      },
      "sample": {
        "people": 452,
        "sessions": 2056,
        "window": { "from": "…", "to": "…", "days": 28 }
      }
    }
  ]
}
```

- `weights.features[key]`: share of the persona's sessions that used the feature.
- `dropOff[funnel][step]`: share lost between the previous step and this one (`null` when
  fewer than 10 people reached the previous step).

---

## 5. Issue sink (output to Orqea)

```text
IssueSink.open(payload)        → { ref }      // Orqea creates a card on its issue board
IssueSink.update(ref, payload)                // same card, new state
```

Configured by `VIGIE_ISSUES_URL` / `VIGIE_ISSUES_TOKEN`. Called when an incident opens,
changes, is reproduced, resolved or reopened. A failing sink is logged and retried on the
next change; it never blocks detection.

```json
{
  "schema": 1,
  "source": "vigie",
  "incidentId": 1,
  "env": "prod",
  "title": "Slow /api/boards/:boardId",
  "severity": "high",
  "status": "confirmed",
  "affected": {
    "routes": ["/api/boards/:boardId"],
    "pages": [],
    "features": ["card.move"],
    "errorFingerprints": []
  },
  "segments": {
    "device": [
      { "value": "mobile", "share": 0.86 },
      { "value": "desktop", "share": 0.14 }
    ],
    "plan": [
      { "value": "free", "share": 0.84 },
      { "value": "pro", "share": 0.16 }
    ]
  },
  "firstSeen": "2026-09-01T11:00:00.000Z",
  "lastSeen": "2026-09-01T12:00:00.000Z",
  "appVersion": "2.4.0",
  "sinceVersion": "2.4.0",
  "triggers": [
    {
      "kind": "latency",
      "source": "events",
      "route": "/api/boards/:boardId",
      "severity": "high",
      "numbers": {
        "currentP95Ms": 3763,
        "baselineP95Ms": 340,
        "ratio": 11.06,
        "samples": 70,
        "baselineSamples": 2657,
        "thresholds": { "minSamples": 30, "minRatio": 1.5, "minDeltaMs": 100 }
      },
      "detectedAt": "2026-09-01T12:00:00.000Z"
    }
  ],
  "reproduction": {
    "targetEnv": "recette",
    "state": "reproduced",
    "evidence": { "…": "from Figura" }
  },
  "evidenceLinks": ["https://vigie.example/#/incidents/1?env=prod"]
}
```

`severity` ∈ `low`, `medium`, `high`. `status` ∈ `open`, `reproducing`, `confirmed`,
`not_reproduced`, `resolved`, `reopened`. `triggers[].kind` ∈ `latency`, `error_spike`,
`funnel_drop`, `rage_click`, `quick_exit`, `log_evidence`. No user identity is ever included.

---

## 6. Catalogues

In code (`api/src/catalogues.js`), versioned, and served at `GET /v1/catalogues` (operator
session). Unknown `type` or `feature` values are rejected at ingestion.

- `features` (v1): `board.create`, `board.share`, `list.create`, `card.create`, `card.move`,
  `card.bulk`, `card.comment`, `rules.edit`, `agent.run`, `forms.create`, `qr.create`,
  `import.trello`, `calendar.view`, `billing.upgrade`, `search.global`, `cicd.connect`,
  `members.invite`, `export.csv`. **The integrator aligns this list with Orqea** (bump the
  version).
- `funnels` (v1):
  - `activation`: `landing` (page_view, source landing) → `signup_start` (page_view `/signup`)
    → `signup_done` (signup) → `first_board` (feature_use `board.create`) → `first_card`
    (feature_use `card.create`) → `day7_return` (login ≥ 7 days after landing).
  - `upgrade`: `paywall_hit` → `upgrade`.
    Steps must happen in order; subjects are visitors.
- `segments` (v1): plan × seats (`1`, `2-10`, `11-50`, `51+`) × tenure (`new` < 30 days ≤
  `established` < 365 ≤ `veteran`) × activity (`new` if the account is < 14 days old, else by
  distinct active days in 28: `occasional` < 4 ≤ `regular` < 12 ≤ `power`).
- `kAnonymity`: 10.

---

## 7. Dashboard single sign-on

1. The admin console embeds the dashboard in an `<iframe>` whose URL ends with
   `#sso=<jwt>`: an HS256 token signed with `VIGIE_SSO_SECRET` (≥ 32 chars):

   ```json
   {
     "iss": "orqea",
     "aud": "vigie",
     "sub": "operator-42",
     "name": "Ada Lovelace",
     "iat": 1788264000,
     "exp": 1788264060,
     "jti": "5f0c…unique"
   }
   ```

   `exp − iat` ≤ 60 s (5 s clock skew tolerated), `jti` single use, `name` only goes to
   Vigie's audit log.

2. The dashboard removes the fragment from the URL immediately, then calls:

   ```http
   POST /auth/sso
   Content-Type: application/json

   { "token": "<jwt>" }
   ```

   ```json
   200 { "token": "<vigie session>", "expiresAt": "2026-09-01T12:30:00.000Z",
         "operator": { "sub": "operator-42", "name": "Ada Lovelace" } }
   ```

   Errors (401): `sso_malformed`, `sso_bad_algorithm`, `sso_bad_signature`,
   `sso_bad_issuer`, `sso_bad_audience`, `sso_missing_claim`, `sso_lifetime_too_long`,
   `sso_not_yet_valid`, `sso_expired`, `sso_replayed`; 503 `sso_not_configured`.

3. The Vigie session is a **bearer token** (`Authorization: Bearer <token>`), signed with
   `VIGIE_SESSION_SECRET` (distinct from the SSO secret), valid `VIGIE_SESSION_TTL_SECONDS`
   (default 1800). No cookie, so it works in a cross-site iframe. There is no login screen and
   no user table.
4. Framing: every API response and the dashboard's HTML carry
   `Content-Security-Policy: … frame-ancestors <VIGIE_ALLOWED_FRAME_ANCESTORS>`; there is no
   `X-Frame-Options`.

---

## 8. Operator API (used by the dashboard)

All require `Authorization: Bearer <session>` (else `401 unauthorized`). `env` is always
required (`400 invalid_env` otherwise). The dashboard reaches them under `/api/`.

| Method & path                                                                 | Returns                                                                                                                   |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `GET /v1/session`                                                             | `{ operator: { sub, name } }`                                                                                             |
| `GET /v1/catalogues`                                                          | §6                                                                                                                        |
| `GET /v1/settings`                                                            | mode, retention, k, catalogue versions, ingestion and adapter status (`configured`/`fake`/`not_configured`)               |
| `GET /v1/incidents?env=&status=`                                              | `{ env, incidents: [...] }`                                                                                               |
| `GET /v1/incidents/:id?env=`                                                  | `{ incident }` (with triggers, segments, replay, history)                                                                 |
| `POST /v1/incidents/:id/replay?env=` `{ targetEnv }`                          | `{ incident }` status `reproducing`; `400 figura_target_forbidden`, `409 invalid_transition`, `503 figura_not_configured` |
| `POST /v1/incidents/:id/resolve?env=`                                         | `{ incident }` status `resolved`                                                                                          |
| `POST /v1/detect?env=`                                                        | `{ env, at, signals, incidents: [{ id, key, change }], sourceErrors }`                                                    |
| `GET /v1/routes?env=`                                                         | route templates known in the aggregates                                                                                   |
| `GET /v1/compare/latency?envs=prod,recette&route=&days=`                      | `{ route, days, series: { prod: [...], recette: [...] } }` — side by side, never merged                                   |
| `GET /v1/insights/{usage,landing,funnels,segments,errors}?env=&days=[&by=plan | device]`                                                                                                                  | insight + `{ env, window, analytics: { events, hasData } }` |
| `POST /v1/personas/preview` `{ sourceEnv, targetEnv, days }`                  | `{ …meta, set: PersonaSet                                                                                                 | null }`                                                     |
| `POST /v1/personas/push` `{ sourceEnv, targetEnv, days }`                     | `{ …, pushed, accepted, id }`                                                                                             |
| `GET /v1/personas?env=`                                                       | persona sets sent from that source environment                                                                            |

Every people count in an insight is `{ "value": n, "masked": false }` or, below k = 10,
`{ "value": null, "masked": true }` (shown as "< 10"). This is applied server side.

---

## 9. Error codes

| Code                                                                                    | Status | Meaning                                      |
| --------------------------------------------------------------------------------------- | ------ | -------------------------------------------- |
| `unauthorized`                                                                          | 401    | missing/invalid ingestion bearer or session  |
| `invalid_env`                                                                           | 400    | `env` missing or not dev/recette/prod        |
| `invalid_batch`, `too_many_events`                                                      | 400    | ingestion batch shape / size                 |
| `invalid_request`                                                                       | 400    | malformed JSON                               |
| `payload_too_large`                                                                     | 413    | body over the limit                          |
| `unsupported_media_type`                                                                | 415    | not JSON                                     |
| `invalid_user`                                                                          | 400    | subject id is not an opaque id               |
| `invalid_incident_id`, `invalid_status`, `invalid_route`, `compare_needs_distinct_envs` | 400    | bad operator parameters                      |
| `incident_not_found`                                                                    | 404    | no such incident **in this environment**     |
| `invalid_transition`                                                                    | 409    | action not allowed in the incident's status  |
| `figura_target_forbidden`                                                               | 400    | Figura target not dev/recette                |
| `figura_not_configured`                                                                 | 503    | no Figura for that target                    |
| `sso_*`                                                                                 | 401    | see §7                                       |
| `sso_not_configured`, `session_not_configured`                                          | 503    | secrets missing                              |
| `not_implemented`                                                                       | 501    | a real adapter stub was reached              |
| `upstream_timeout`, `upstream_unreachable`, `upstream_error`                            | 502    | adapter HTTP failure                         |
| `not_found`                                                                             | 404    | unknown path                                 |
| `internal_error`                                                                        | 500    | anything else (details only in Vigie's logs) |

---

## 10. Health

- `GET /healthz` → `200 { "status": "ok" }` (process alive).
- `GET /readyz` → `200 { "status": "ready" }`, or `503 { "status": "unavailable" }` when
  PostgreSQL does not answer.
