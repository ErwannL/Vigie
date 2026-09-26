# Integration checklist

How to plug the Vigie brick into the real systems. Work top to bottom; each step says where
the code is, what to write, and how to check it. The contract is `CONTRACT.md`.

Legend: **[Vigie]** change in this repository · **[Orqea]** change in Orqea ·
**[Ops]** deployment/configuration.

---

## 0. Deploy the brick

- [ ] **[Ops]** Copy `.env.example` to `.env` (or your secret store). Generate every secret
      with `openssl rand -base64 48` (≥ 32 chars). `VIGIE_SSO_SECRET` and
      `VIGIE_SESSION_SECRET` **must differ** (Vigie refuses to start otherwise).
- [ ] **[Ops]** Set `VIGIE_MODE=production`: missing adapters are then _disabled_ (shown as
      "Not configured" in Settings) instead of faked.
- [ ] **[Ops]** `docker compose up -d` (PostgreSQL, API, jobs, dashboard). Migrations run on
      API and jobs start. Check `GET /healthz` and `GET /readyz`.
- [ ] **[Ops]** Put the API and the dashboard behind TLS. Only Orqea's backend needs to reach
      `/v1/events` and `/v1/subjects`; only the admin console's users need the dashboard.
- [ ] **[Ops]** Set `VIGIE_ALLOWED_FRAME_ANCESTORS` to the admin console origin (e.g.
      `https://admin.orqea.com`) and `VIGIE_PUBLIC_URL` to the dashboard URL.
- [ ] **[Ops]** Back up the `pgdata` volume; size it for `VIGIE_RAW_RETENTION_DAYS` of events.

## 1. What Orqea must build

### 1.1 Event forwarding route **[Orqea]**

- [ ] Backend route (e.g. `POST /internal/telemetry`) that receives batches from Orqea's
      frontend (same origin, the user's own session) and forwards them to
      `POST {VIGIE}/v1/events` with `Authorization: Bearer <VIGIE_INGEST_SECRET_<ENV>>`
      (the secret of **the environment this Orqea instance is**).
- [ ] Batch ≤ 500 events and ≤ 1 MB; timeout ~5 s; on network errors retry the **same
      batch** (same `eventId`s — ingestion is idempotent); drop after a few tries (telemetry
      must never break the app).
- [ ] Fill `env` server side from Orqea's own configuration; never trust the browser for it.
- [ ] Log rejected `code`s (not bodies) to spot integration bugs: `page_not_template`,
      `unknown_feature` and `unsanitised_error_message` usually mean a mapping to fix.

### 1.2 Pseudonymous ids **[Orqea]**

- [ ] `visitor`: HMAC-SHA256 of a first-party random cookie id (or of the IP + user agent
      **with a daily rotating key** if no cookie is allowed), keyed with an Orqea-only secret,
      truncated/base64url to ≤ 128 chars matching `[A-Za-z0-9_-]{8,128}`. **Never** send a raw IP.
- [ ] `user`: HMAC of Orqea's user id with a separate Orqea-only key (stable, so GDPR
      erasure can find it). Keep the key: Orqea needs it to compute the id at erasure time.
- [ ] `session`: random id per visit.

### 1.3 Backend events **[Orqea]**

- [ ] Express middleware emitting `api_request` with `perf.route = req.route.path`-based
      **template** (the same label Prometheus uses), `durationMs`, `status`; `source: backend`.
- [ ] Error handler emitting `server_error` with a stable `error.fingerprint` (e.g.
      `<ErrorClass>:<handler-name>`) and a sanitised `message` (or none).
- [ ] Auth events: `signup`, `login`, `login_failed`, `logout` (`source: auth`).
- [ ] Billing events: `paywall_hit` (with the gated `feature`), `upgrade`.
- [ ] `account` block from the account (plan, seats, age in days) and `context.appVersion`
      from the deployed version (this powers "since version X" and reopening).

### 1.4 Frontend instrumentation **[Orqea]**

- [ ] `page_view` with the **router template** (`/board/:boardId`), never `location.href`.
- [ ] `data-vigie="<stable id>"` attributes on the elements to track (landing CTAs, save
      buttons, menus). Ids are lowercase `a-z0-9_.-`, never the visible label.
      `click` events carry `target.element` = that attribute.
- [ ] `feature_use` with a catalogue key (align the catalogue first, §4).
- [ ] `client_error` from `window.onerror`/React error boundaries with a fingerprint.
- [ ] Never put card content, form values, input values or button text in any field
      (Vigie rejects unknown fields anyway).

### 1.5 Consent banner **[Orqea]**

- [ ] Until it exists, send `consent: "essential"` on every event (Module 1 fully works).
- [ ] When the banner ships, send `consent: "analytics"` only for users who accepted.
      Module 2 then starts showing data (it shows "no analytics consent data yet" before).

### 1.6 SSO handoff route **[Orqea]**

- [ ] Admin console route that, for an authenticated operator, signs an HS256 JWT with
      `VIGIE_SSO_SECRET`: `{ iss: "orqea-admin-console", aud: "vigie", operator: <operator id>, iat,
exp: iat + 60, jti: <random uuid> }` (Orqea's existing admin handoff factory, which must
      add `jti`; `sub`/`name` are optional) and renders
      `<iframe src="https://vigie.example/#sso=<jwt>">`. Mint a new token for each load.
- [ ] Reference implementation: `api/src/auth/jwt.js` (`signHs256`); test vectors:
      `api/test/auth.test.js`.

### 1.7 Issue board mapping **[Orqea]**

- [ ] Endpoint receiving the IssueSink payload (`CONTRACT.md` §5), bearer
      `VIGIE_ISSUES_TOKEN`: `POST {VIGIE_ISSUES_URL}` creates a card → `201 { ref }`;
      `PUT {VIGIE_ISSUES_URL}/{ref}` updates it → `200`.
- [ ] Mapping suggestion: title → card title; severity → label; `affected` and `segments` →
      description; `reproduction.state` → checklist item; `evidenceLinks` → link to Vigie.

### 1.8 GDPR **[Orqea]**

- [ ] On an erasure or export request, compute the user's pseudonymous id (§1.2) and call
      `DELETE` / `GET {VIGIE}/v1/subjects/<id>` **once per environment** with that
      environment's ingestion secret.

## 2. Plug the observability sources **[Vigie]**

The adapters are implemented and tested (`api/test/adapters-real.test.js`, fake `fetchImpl`);
what is left is configuration and checking against the real systems (`CONTRACT.md` §3).

- [x] **[Vigie] Logs – Loki**: `api/src/adapters/logs/loki.js` (selector
      `VIGIE_LOKI_SELECTOR`, default `{container=~".*backend.*"}`, then `| json`; `msgKind`
      never the message text).
- [ ] **[Ops]** Configure `VIGIE_LOKI_URL_DEV|RECETTE|PROD`.
- [x] **[Vigie] Metrics – Prometheus**: `api/src/adapters/metrics/prometheus.js`
      (`VIGIE_PROMETHEUS_METRIC`, default `orqea_http_request_duration_seconds_bucket`).
- [ ] **[Ops]** Configure `VIGIE_PROMETHEUS_URL_<ENV>`.
- [x] **[Vigie] Errors – GlitchTip/Sentry**: `api/src/adapters/errors/glitchtip.js`; `route`
      from `culprit` when it is a route template.
- [ ] **[Ops]** Configure `VIGIE_ERRORS_URL_<ENV>` (instance base URL),
      `VIGIE_ERRORS_TOKEN_<ENV>` and `VIGIE_ERRORS_PROJECT_<ENV>` (`org/project`).
- [ ] Check: Settings shows the source as "Configured"; `POST /v1/detect?env=prod` returns
      no `sourceErrors`; incidents show `source: metrics|errors|logs` triggers.

## 3. Plug Figura **[Vigie + Figura team]**

- [x] **[Vigie]** `api/src/adapters/figura/figura.js`: `POST /api/vigie/replays`,
      `GET /api/vigie/replays/{runId}`, `POST /api/vigie/personas`, bearer token
      (`CONTRACT.md` §4).
- [ ] **[Figura]** Expose those endpoints, accepting the scenario and persona-set formats of
      `CONTRACT.md` §4.
- [ ] Configure `VIGIE_FIGURA_URL_DEV|RECETTE` and `VIGIE_FIGURA_TOKEN_DEV|RECETTE` (≥ 32
      chars). **There is no prod
      Figura setting and there must never be one**; `client.js` refuses prod and a test
      (`api/test/adapters.test.js`) guards it.
- [ ] Optional: `VIGIE_AUTO_REPLAY_TARGET=recette` to replay every new incident automatically.
- [ ] Check: replay an incident from the dashboard; the jobs process polls it every 30 s and
      the incident becomes `confirmed` or `not_reproduced`.

## 4. Align the catalogues **[Vigie + Orqea]**

- [ ] Replace/extend `FEATURES.items` in `api/src/catalogues.js` with Orqea's real feature
      keys; bump `FEATURES.version`. Same for `FUNNELS` if steps differ (e.g. the signup page
      template). Update the seed if keys disappear (`api/src/seed/generate.js`).
- [ ] Orqea's frontend uses exactly these keys (share the file or `GET /v1/catalogues`).

## 5. Plug the issue sink **[Vigie]**

- [x] **[Vigie]** `api/src/adapters/issues/orqea.js` implements §1.7's endpoints (POST /
      PUT, bearer).
- [ ] **[Ops]** Configure `VIGIE_ISSUES_URL`, `VIGIE_ISSUES_TOKEN`.
- [x] **[Vigie]** SSO accepts Orqea's handoff (`iss` = `VIGIE_SSO_ISSUER`, `operator` claim).
- [ ] Check: a new incident creates a card; resolving it in Vigie updates the card.

## 6. Final verification

- [ ] `make verify` (check, lint, format, 100 % coverage) is green.
- [ ] In recette: send a few real events, open the dashboard from the admin console, run
      detection, replay an incident in dev, push personas to recette.
- [ ] In prod: start with `consent: essential` only; confirm Settings shows every source
      "Configured" and the retention you expect.
