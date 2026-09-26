import { minutesAgo, within } from '../fixtures.js';

/**
 * MetricsSource backed by fixtures: `[{ route, points: [{ offsetMinutes, valueMs }] }]`.
 * latency({ from, to, route?, quantile }) → [{ route, ts, valueMs }]
 */
export function createFakeMetricsSource(series, clock) {
  return {
    async latency({ from, to, route = null }) {
      const now = clock.now();
      return series
        .filter((s) => route === null || s.route === route)
        .flatMap((s) =>
          s.points.map((p) => ({
            route: s.route,
            ts: minutesAgo(now, p.offsetMinutes),
            valueMs: p.valueMs,
          })),
        )
        .filter((p) => within(p.ts, from, to))
        .map((p) => ({ ...p, ts: p.ts.toISOString() }));
    },
  };
}
