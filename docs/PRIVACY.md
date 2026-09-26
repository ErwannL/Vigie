# Privacy

What Vigie collects, why, how long it keeps it, and how it is erased. Every rule below has a
test (named in brackets).

## Principles

1. **Pseudonymous input only.** Vigie never receives a raw IP address, an email, a name, or
   anything a user typed. Identifiers are opaque ids computed by Orqea (HMAC), and the
   collector rejects events that look otherwise. [`validate.test.js`, `sanitize.test.js`]
2. **Templates, not URLs.** Pages and API routes are route templates (`/board/:boardId`);
   anything that looks like an id, an email, a token or a query string is rejected.
3. **No free text.** Events have a closed schema: an unknown field at any level is rejected, so
   card content, form values, input values and button text have nowhere to go. Clicked
   elements are identified by developer-given `data-vigie` ids, not labels. Error messages
   are limited to 300 characters and rejected if they contain an email, IP, UUID, long
   number, JWT, credential word, URL with a query, or long opaque string.
4. **Aggregates only on screen.** No page lists individual users. Every people count below
   **k = 10** is removed **server side** before leaving the API. [`insights-units.test.js`,
   `insights-service.test.js` asserts no visible count under 10]
5. **Environments never mix.** Every record carries its environment; every read requires one.

## What is collected

| Data                                                | Why                                             | With `essential` consent |
| --------------------------------------------------- | ----------------------------------------------- | ------------------------ |
| event type, time, source, env                       | everything                                      | kept                     |
| route template, duration, HTTP status               | slowness and error detection (Module 1)         | kept                     |
| error kind, fingerprint, sanitised message          | error detection and grouping                    | kept                     |
| page template                                       | where problems happen; quick exits after errors | kept                     |
| session id (random per visit)                       | links an error to the exit that follows it      | kept                     |
| plan, device, app version                           | "mostly mobile, free plan", "since version X"   | kept                     |
| visitor id (HMAC by Orqea)                          | landing and funnel analysis (Module 2)          | **dropped**              |
| user id (HMAC by Orqea)                             | usage per person, segments, retention, GDPR     | **dropped**              |
| element id (`data-vigie`), feature key              | feature usage, clicks, rage clicks              | **dropped**              |
| seats, account age, segment, country, locale, theme | segments and personas                           | **dropped**              |

Consent is decided by Orqea. Until its consent banner exists every event arrives as
`essential`; Vigie's Module 1 works fully with that, and Module 2 shows "no analytics
consent data yet" instead of charts. [`validate.test.js` "essential consent drops …",
`insights-service.test.js` "without analytics consent data …"]

Operators: the SSO token's `sub` (operator id) and `name` are stored only in the
`audit_log` table (who logged in, replayed, resolved, pushed personas). They are never
returned by the API except the current operator's own session.

## Retention

- Raw events: `VIGIE_RAW_RETENTION_DAYS` (default **60**). The jobs process deletes older
  events every hour, per environment, after rolling them up. Events older than the retention
  are also refused at ingestion. [`jobs.test.js` "retention …"]
- Daily aggregates (`daily_route_stats`, `daily_feature_usage`): kept after raw deletion.
  They hold counts per day and route/feature, no identifier.
- Incidents: kept; they hold templates, catalogue keys, shares and numbers only.
- Persona sets: kept (history of what was sent to Figura); aggregated per ≥ 10 people.
- Used SSO token ids: purged once expired.

The retention is shown in the dashboard (Settings).

## Erasure and export (GDPR)

- `DELETE /v1/subjects/:user` erases every event tied to a pseudonymous user id;
  `GET /v1/subjects/:user` returns them (export). Authenticated with the ingestion bearer and
  scoped to its environment; Orqea calls it once per environment. Both are idempotent.
  [`http-public.test.js` "GDPR …", `store.test.js`]
- Aggregates, incidents and persona sets contain no user id, so nothing else holds the
  subject.
- Essential-consent events never carry a user id at all.

## Logs

Vigie never logs an event body, a token or a secret. Requests are logged by route template
(not raw URL), without headers or bodies, at `debug` level; `info` is kept for lifecycle
events (start, detection summaries). [`http-public.test.js` "logs never contain …"]

## Figura

Scenarios and persona sets are built only from route templates, catalogue keys and
aggregates. A scenario path is used only when at least 5 sessions share it, never from one
user's trail. [`incidents-scenario.test.js`] Figura only ever runs in dev or recette, so
synthetic users never touch production data. [`adapters.test.js`]
