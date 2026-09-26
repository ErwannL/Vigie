# api/src/adapters/metrics/

`MetricsSource.latency({ from, to, route?, quantile }) → [{ route, ts, valueMs }]`

- `fake.js` – fixture series (`api/fixtures/<env>.json` → `metrics`).
- `prometheus.js` – Prometheus `query_range` (`VIGIE_PROMETHEUS_URL_<ENV>`):
  `histogram_quantile` over `VIGIE_PROMETHEUS_METRIC` (default
  `orqea_http_request_duration_seconds_bucket`) by the route-template label, step 60 s,
  seconds → ms, NaN/Inf skipped.

Module 1 averages points per route and compares the detection window with the baseline, like
it does for collected `api_request` events (signal `source: "metrics"`).
