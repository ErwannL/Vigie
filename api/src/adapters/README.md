# api/src/adapters/

Every external system is reached through an adapter. Each has an interface (documented in
`docs/CONTRACT.md` §4.2–4.4), a **fake** used in development and tests, and a **real stub**
that throws `NotImplemented` and describes, in a comment, what the integrator must write.

| Folder     | Interface                                 | Fake      | Real stub       |
| ---------- | ----------------------------------------- | --------- | --------------- |
| `logs/`    | `LogsSource.query`                        | `fake.js` | `loki.js`       |
| `metrics/` | `MetricsSource.latency`                   | `fake.js` | `prometheus.js` |
| `errors/`  | `ErrorsSource.issues`                     | `fake.js` | `glitchtip.js`  |
| `figura/`  | `FiguraClient.replay/status/pushPersonas` | `fake.js` | `figura.js`     |
| `issues/`  | `IssueSink.open/update`                   | `fake.js` | `orqea.js`      |

- `registry.js` picks the implementation per slot: URL configured → real; missing in
  `development` → fake; missing in `production` → disabled ("not configured" in Settings).
  Logs/metrics/errors are configured per Orqea environment, Figura per target (dev, recette).
- `figura/client.js` wraps every Figura implementation and refuses `targetEnv: prod` before
  any call. There is no configuration for a prod Figura.
- `http.js` (`fetchJson`) is the only allowed way to call out: it requires a timeout.
- `fixtures.js` holds time helpers shared by the fakes.
