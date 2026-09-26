import { minutesAgo, within } from '../fixtures.js';

/**
 * ErrorsSource backed by fixtures: `[{ fingerprint, title, route?, occurrences: [offsetMinutes] }]`.
 * issues({ from, to }) → [{ fingerprint, title, count, firstSeen, lastSeen, route? }]
 */
export function createFakeErrorsSource(issues, clock) {
  return {
    async issues({ from, to }) {
      const now = clock.now();
      return issues
        .map((issue) => {
          const seen = issue.occurrences
            .map((m) => minutesAgo(now, m))
            .filter((d) => within(d, from, to))
            .sort((a, b) => a - b);
          return { issue, seen };
        })
        .filter(({ seen }) => seen.length > 0)
        .map(({ issue, seen }) => ({
          fingerprint: issue.fingerprint,
          title: issue.title,
          count: seen.length,
          firstSeen: seen[0].toISOString(),
          lastSeen: seen[seen.length - 1].toISOString(),
          route: issue.route ?? null,
        }));
    },
  };
}
