# Vigie

Vigie watches how real people use **Orqea**, finds what is slow or broken, reproduces it with
**Figura**, and tells the dev team where to focus. It is a standalone brick: it only talks to
the outside world through the contracts in [`docs/CONTRACT.md`](docs/CONTRACT.md), and every
external system sits behind an adapter with a fake (shipped) and a real stub (to write).

```
Vigie
├── Collector (shared)   POST /v1/events → validate, pseudonymise, store (per environment)
├── Module 1: Incidents  slowness, errors, funnel drops, rage → correlate → Figura replay → issue card
└── Module 2: Insights   feature usage, landing, funnels, segments → dashboards → Figura personas
     + Dashboard         React, embedded in the Orqea admin console (iframe + SSO handoff)
```

It tracks Orqea's three environments — `dev`, `recette`, `prod` — separately: every record
knows its environment, every read requires one, and the ingestion credential (not the
sender) decides it. Figura only ever runs in dev or recette.

## Quick start (only Docker needed)

```bash
cp .env.example .env          # demo values; VIGIE_MODE=development uses the fakes
docker compose up --build -d  # PostgreSQL, API (:3000), jobs, dashboard (:8080)
docker compose --profile tools run --rm seed   # ≈ 3,400 visitors, 140k events, 4 planted incidents
```

Open the dashboard through a (simulated) admin-console handoff: it needs `#sso=<jwt>` signed
with `VIGIE_SSO_SECRET`. For a local demo:

```bash
docker compose run --rm api node -e "import('./api/src/auth/jwt.js').then(({signHs256})=>{const t=Math.floor(Date.now()/1000);console.log('http://localhost:8080/#sso='+signHs256({iss:'orqea',aud:'vigie',sub:'demo',name:'Demo',iat:t,exp:t+60,jti:crypto.randomUUID()},process.env.VIGIE_SSO_SECRET))})"
```

Open the printed URL within 60 seconds. Without a handoff the dashboard explains how to get
in (there is no login screen).

`make` wraps everything in Docker: `make up`, `make seed`, `make verify` (check + lint +
format + coverage), `make coverage`, `make lint`, `make format`, `make clean`.

## What the demo shows

In **prod** (seeded relative to "now"): a slow `/api/boards/:boardId` since version `2.4.0`,
mostly on mobile and the free plan; an error spike `TypeError:card-move-null` with users
leaving right after it; rage clicks on `card.save`; a signup funnel drop. Replay one in
recette from the incident page, compare the route's p95 in prod vs recette, browse usage
(never-used features, segments, errors per segment), funnels and landing, preview and push
personas to Figura. **recette** is healthy; **dev** only has `essential`-consent events, so
Module 2 shows its "no analytics consent data yet" state. Settings shows every source as
_fake_ (demo), _configured_ or _not configured_.

Screenshots of the demo (taken in a 1024 px iframe from a fake admin console, with a real
SSO handoff) are in [`docs/screenshots/`](docs/screenshots/).

## Layout

| Path                       | What                                                                        |
| -------------------------- | --------------------------------------------------------------------------- |
| [`api/`](api/)             | Node.js 22 + Fastify + PostgreSQL: collector, modules, adapters, jobs, seed |
| [`dashboard/`](dashboard/) | React 19 + Vite SPA, served by nginx (proxies `/api`)                       |
| [`docs/`](docs/)           | `CONTRACT.md`, `INTEGRATION.md`, `PRIVACY.md`, `DECISIONS.md`               |
| [`scripts/`](scripts/)     | `check.js`: file size, LF, README per folder, no skipped tests              |
| `Dockerfile`               | targets `api`, `dashboard`, `dev` (tests/lint)                              |
| `docker-compose.yml`       | `postgres`, `api`, `jobs`, `dashboard`; profiles `tools` (seed), `test`     |

Every folder has a README explaining its part.

## Quality bar

- **100 % coverage** (statements, branches, functions, lines) on the API and the dashboard,
  enforced by `npm run coverage` (Vitest + V8; the command fails below 100 %). No coverage
  escapes, no skipped or focused tests (`scripts/check.js` fails on them).
- Key tests were verified to go red when the rule they protect is broken
  ([`docs/DECISIONS.md`](docs/DECISIONS.md#verified-by-breaking-the-code)).
- ESLint with zero warnings, Prettier, LF everywhere (`.gitattributes`), no file over 1000
  lines, functions ≤ 80 lines (ESLint rule, tests included).
- Every outbound HTTP call has a timeout; every timer is injected; tests read nothing but
  `TEST_DATABASE_URL`.
- `/healthz` (alive) and `/readyz` (PostgreSQL reachable, else 503).

## Configuration

All settings are environment variables, documented in [`.env.example`](.env.example).
Secrets must be ≥ 32 characters (shorter = absent); the SSO and session secrets must differ.

## For the integrator

Start with [`docs/INTEGRATION.md`](docs/INTEGRATION.md): what Orqea must build (event
forwarding, pseudonymous ids, `data-vigie` attributes, consent banner, SSO handoff, issue
board mapping, GDPR calls) and how to replace each adapter stub.
