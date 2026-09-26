import { NotImplementedError } from '../../errors.js';

/**
 * Real LogsSource for Loki. TO BE WRITTEN BY THE INTEGRATOR (docs/INTEGRATION.md §Logs).
 *
 * query({ from, to, route?, level? }) must call, through ../http.js fetchJson with timeoutMs,
 *   GET {url}/loki/api/v1/query_range
 *     ?query={app="orqea-api"} | json | route="<route>" | level="<level>"
 *     &start=<from ns>&end=<to ns>&limit=5000&direction=forward
 * and map each JSON log line to { ts, level, route, durationMs, status, msgKind }, where
 * `route` is the Express route template and `msgKind` a stable message key (never the text).
 */
export function createLokiLogsSource({ url, timeoutMs }) {
  return {
    url,
    timeoutMs,
    async query() {
      throw new NotImplementedError('LogsSource.query (loki)');
    },
  };
}
