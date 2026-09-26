# api/src/adapters/metrics/

`MetricsSource.latency({ from, to, route?, quantile }) → [{ route, ts, valueMs }]`

- `fake.js` – fixture series (`api/fixtures/<env>.json` → `metrics`).
- `prometheus.js` – stub for Prometheus (`VIGIE_PROMETHEUS_URL_<ENV>`); the comment gives the
  `histogram_quantile` query on the route-template label.

Module 1 averages points per route and compares the detection window with the baseline, like
it does for collected `api_request` events (signal `source: "metrics"`).
