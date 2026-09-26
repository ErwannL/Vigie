import { makeEvent } from './helpers.js';

export const NOW = new Date('2026-09-01T12:00:00.000Z');

export function ago(minutes, now = NOW) {
  return new Date(now.getTime() - minutes * 60000).toISOString();
}

let seq = 0;
export const sid = (prefix = 'sess') => `${prefix}_${String((seq += 1)).padStart(8, '0')}`;

/** API request events on one route. */
export function apiEvents({ env = 'prod', route, count, durationMs, minutesAgo, over = {} }) {
  return Array.from({ length: count }, (_, i) =>
    makeEvent({
      env,
      type: 'api_request',
      source: 'backend',
      session: sid(),
      occurredAt: ago(typeof minutesAgo === 'function' ? minutesAgo(i) : minutesAgo),
      perf: {
        route,
        durationMs: typeof durationMs === 'function' ? durationMs(i) : durationMs,
        status: 200,
      },
      ...over,
    }),
  );
}

/** Sessions that browse /boards → /board/:boardId then call `route`. */
export function pathSessions({ env = 'prod', route, count, minutesAgo, durationMs = 2000 }) {
  return Array.from({ length: count }, () => {
    const session = sid();
    const base = { env, session, perf: {}, context: { device: 'mobile', appVersion: '2.4.0' } };
    return [
      makeEvent({
        ...base,
        type: 'page_view',
        occurredAt: ago(minutesAgo + 2),
        target: { page: '/boards' },
      }),
      makeEvent({
        ...base,
        type: 'page_view',
        occurredAt: ago(minutesAgo + 1),
        target: { page: '/board/:boardId' },
      }),
      makeEvent({
        ...base,
        type: 'api_request',
        source: 'backend',
        occurredAt: ago(minutesAgo),
        perf: { route, durationMs, status: 200 },
        target: { feature: 'card.move' },
      }),
    ];
  }).flat();
}

export async function ingest(container, env, events) {
  for (let i = 0; i < events.length; i += 500) {
    const res = await container.collector.ingest(env, { events: events.slice(i, i + 500) });
    if (res.rejected.length > 0) throw new Error(JSON.stringify(res.rejected.slice(0, 3)));
  }
}

/** A slow-route dataset: healthy baseline on 2.3.1, slow current window on 2.4.0. */
export function slowRouteData({ env = 'prod', route = '/api/boards/:boardId' } = {}) {
  return [
    ...apiEvents({
      env,
      route,
      count: 60,
      durationMs: (i) => 100 + i,
      minutesAgo: (i) => 120 + i * 60,
      over: { context: { device: 'desktop', appVersion: '2.3.1' } },
    }),
    ...pathSessions({ env, route, count: 40, minutesAgo: 20 }),
  ];
}
