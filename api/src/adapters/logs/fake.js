import { minutesAgo, within } from '../fixtures.js';

/**
 * LogsSource backed by fixtures: `[{ offsetMinutes, level, route, durationMs, status, msgKind }]`.
 * query({ from, to, route?, level? }) → [{ ts, level, route, durationMs, status, msgKind }]
 */
export function createFakeLogsSource(entries, clock) {
  return {
    async query({ from, to, route = null, level = null }) {
      const now = clock.now();
      return entries
        .map(({ offsetMinutes, ...rest }) => ({ ts: minutesAgo(now, offsetMinutes), ...rest }))
        .filter((e) => within(e.ts, from, to))
        .filter((e) => route === null || e.route === route)
        .filter((e) => level === null || e.level === level)
        .map((e) => ({ ...e, ts: e.ts.toISOString() }));
    },
  };
}
