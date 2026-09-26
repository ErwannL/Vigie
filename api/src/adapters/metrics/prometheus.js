import { NotImplementedError } from '../../errors.js';

/**
 * Real MetricsSource for Prometheus. TO BE WRITTEN BY THE INTEGRATOR (docs/INTEGRATION.md).
 *
 * latency({ from, to, route?, quantile }) must call, through ../http.js fetchJson with timeoutMs,
 *   GET {url}/api/v1/query_range
 *     ?query=histogram_quantile(<quantile>, sum by (le, route)
 *            (rate(http_request_duration_seconds_bucket{route="<route>"}[5m])))
 *     &start=<from s>&end=<to s>&step=60
 * and map each sample to { route, ts: ISO string, valueMs: seconds * 1000 }.
 * The `route` label is the Express route template; never query by raw URL.
 */
export function createPrometheusMetricsSource({ url, timeoutMs }) {
  return {
    url,
    timeoutMs,
    async latency() {
      throw new NotImplementedError('MetricsSource.latency (prometheus)');
    },
  };
}
