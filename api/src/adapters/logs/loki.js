import { expectShape, fetchJson, joinUrl, quoteString } from '../http.js';

export const DEFAULT_LOKI_SELECTOR = '{container=~".*backend.*"}';

export function lokiQuery(selector, { route = null, level = null }) {
  let q = `${selector} | json`;
  if (route !== null) q += ` | route=${quoteString(route)}`;
  if (level !== null) q += ` | level=${quoteString(level)}`;
  return q;
}

const toNs = (date) => `${BigInt(date.getTime()) * 1000000n}`;
const stringOrNull = (v) => (typeof v === 'string' && v !== '' ? v : null);
const numberOrNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function parseLine(line) {
  try {
    const value = JSON.parse(line);
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * One Loki line → LogsSource entry. `msgKind` is a stable key (`msgKind` or `event`), never
 * the message text, which is deliberately not read.
 */
export function mapLokiLine(ns, line) {
  const f = parseLine(line);
  if (f === null) return null;
  return {
    ts: new Date(Number(BigInt(ns) / 1000000n)).toISOString(),
    level: stringOrNull(f.level),
    route: stringOrNull(f.route),
    durationMs: numberOrNull(f.durationMs) ?? numberOrNull(f.duration_ms),
    status: numberOrNull(f.status) ?? numberOrNull(f.statusCode),
    msgKind: stringOrNull(f.msgKind) ?? stringOrNull(f.event),
  };
}

/**
 * Real LogsSource for Loki. Orqea's backend logs JSON lines; labels are few (`source`,
 * `container`, `stream`) and every field lives in the line, hence `| json` then filters.
 *   GET {url}/loki/api/v1/query_range?query=<selector> | json [| route="…"] [| level="…"]
 *       &start=<ns>&end=<ns>&limit=5000&direction=forward
 */
export function createLokiLogsSource({
  url,
  timeoutMs,
  selector = DEFAULT_LOKI_SELECTOR,
  fetchImpl = globalThis.fetch,
}) {
  return {
    url,
    timeoutMs,
    selector,
    async query({ from, to, route = null, level = null }) {
      const params = new URLSearchParams({
        query: lokiQuery(selector, { route, level }),
        start: toNs(from),
        end: toNs(to),
        limit: '5000',
        direction: 'forward',
      });
      const body = await fetchJson(joinUrl(url, `/loki/api/v1/query_range?${params}`), {
        timeoutMs,
        fetchImpl,
      });
      const streams = body?.data?.result;
      expectShape(Array.isArray(streams), 'loki.result');
      return streams
        .flatMap((s) => (Array.isArray(s.values) ? s.values : []))
        .map(([ns, line]) => mapLokiLine(ns, line))
        .filter((e) => e !== null)
        .sort((a, b) => a.ts.localeCompare(b.ts));
    },
  };
}
