import { expectShape, fetchJson, joinUrl, quoteString } from '../http.js';

export const DEFAULT_PROMETHEUS_METRIC = 'orqea_http_request_duration_seconds_bucket';

export function latencyQuery(metric, { route = null, quantile }) {
  const filter = route === null ? '' : `{route=${quoteString(route)}}`;
  return `histogram_quantile(${quantile}, sum by (le, route) (rate(${metric}${filter}[5m])))`;
}

/**
 * Real MetricsSource for Prometheus. The `route` label is Orqea's Express route template.
 *   GET {url}/api/v1/query_range?query=histogram_quantile(…)&start=<s>&end=<s>&step=60
 * Each sample becomes { route, ts, valueMs }; NaN/Inf samples (no traffic) are skipped.
 */
export function createPrometheusMetricsSource({
  url,
  timeoutMs,
  metric = DEFAULT_PROMETHEUS_METRIC,
  fetchImpl = globalThis.fetch,
}) {
  return {
    url,
    timeoutMs,
    metric,
    async latency({ from, to, route = null, quantile }) {
      const params = new URLSearchParams({
        query: latencyQuery(metric, { route, quantile }),
        start: String(from.getTime() / 1000),
        end: String(to.getTime() / 1000),
        step: '60',
      });
      const body = await fetchJson(joinUrl(url, `/api/v1/query_range?${params}`), {
        timeoutMs,
        fetchImpl,
      });
      const series = body?.data?.result;
      expectShape(Array.isArray(series), 'prometheus.result');
      return series.flatMap((s) =>
        (Array.isArray(s.values) ? s.values : [])
          .map(([seconds, value]) => ({
            route: typeof s.metric?.route === 'string' ? s.metric.route : null,
            ts: new Date(Number(seconds) * 1000).toISOString(),
            valueMs: Number(value) * 1000,
          }))
          .filter((p) => Number.isFinite(p.valueMs)),
      );
    },
  };
}
