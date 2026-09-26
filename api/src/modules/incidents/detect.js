/**
 * Pure detectors. Each returns signals that carry the numbers and thresholds that triggered
 * them, so every incident can explain itself.
 */

export const THRESHOLDS = Object.freeze({
  latency: { minSamples: 30, minMetricPoints: 3, minRatio: 1.5, minDeltaMs: 100 },
  errors: { minCount: 10, minRatio: 3 },
  funnel: { minEntrants: 30, minAbsoluteDrop: 0.1, minRelativeDrop: 0.25 },
  rage: { minSessions: 5 },
  quickExit: { minSessions: 5, minExitShare: 0.5 },
});

const round = (n, digits = 0) => Number(n.toFixed(digits));

function level(value, medium, high) {
  if (value >= high) return 'high';
  if (value >= medium) return 'medium';
  return 'low';
}

/** current/baseline: [{ route, p95, n }]. Regression = p95 up by ratio AND delta, enough samples. */
export function latencySignals(current, baseline, { source, minSamples }) {
  const t = THRESHOLDS.latency;
  const base = new Map(baseline.map((b) => [b.route, b]));
  return current.flatMap((c) => {
    const b = base.get(c.route);
    if (!b || c.n < minSamples || b.n < minSamples || b.p95 <= 0) return [];
    const ratio = c.p95 / b.p95;
    if (ratio < t.minRatio || c.p95 - b.p95 < t.minDeltaMs) return [];
    return [
      {
        kind: 'latency',
        source,
        route: c.route,
        severity: level(ratio, 2, 3),
        numbers: {
          currentP95Ms: round(c.p95),
          baselineP95Ms: round(b.p95),
          ratio: round(ratio, 2),
          samples: c.n,
          baselineSamples: b.n,
          thresholds: { minSamples, minRatio: t.minRatio, minDeltaMs: t.minDeltaMs },
        },
      },
    ];
  });
}

/** Averages metric points per route into the { route, p95, n } shape used above. */
export function seriesToLatency(points) {
  const byRoute = new Map();
  for (const p of points) {
    const agg = byRoute.get(p.route) ?? { route: p.route, sum: 0, n: 0 };
    agg.sum += p.valueMs;
    agg.n += 1;
    byRoute.set(p.route, agg);
  }
  return [...byRoute.values()].map((a) => ({ route: a.route, p95: a.sum / a.n, n: a.n }));
}

/**
 * current/baseline: [{ fingerprint, route?, page?, count }]. The baseline count is scaled to
 * the current window's length before comparing (floor of 1 expected occurrence).
 */
export function errorSignals(current, baseline, { source, windowMs, baselineMs }) {
  const t = THRESHOLDS.errors;
  const base = new Map(baseline.map((b) => [b.fingerprint, b.count]));
  return current.flatMap((c) => {
    const expected = ((base.get(c.fingerprint) ?? 0) * windowMs) / baselineMs;
    const ratio = c.count / Math.max(expected, 1);
    if (c.count < t.minCount || ratio < t.minRatio) return [];
    return [
      {
        kind: 'error_spike',
        source,
        route: c.route ?? null,
        page: c.page ?? null,
        fingerprint: c.fingerprint,
        severity: c.count >= 100 || ratio >= 10 ? 'high' : level(ratio, 5, Infinity),
        numbers: {
          count: c.count,
          expectedCount: round(expected, 2),
          ratio: round(ratio, 2),
          thresholds: { minCount: t.minCount, minRatio: t.minRatio },
        },
      },
    ];
  });
}

/** current/baseline: [{ funnel, step, entrants, converted }] (conversion into `step`). */
export function funnelSignals(current, baseline) {
  const t = THRESHOLDS.funnel;
  const key = (s) => `${s.funnel}/${s.step}`;
  const base = new Map(baseline.map((b) => [key(b), b]));
  return current.flatMap((c) => {
    const b = base.get(key(c));
    if (!b || c.entrants < t.minEntrants || b.entrants < t.minEntrants) return [];
    const now = c.converted / c.entrants;
    const before = b.converted / b.entrants;
    const drop = before - now;
    const relative = before > 0 ? drop / before : 0;
    if (drop < t.minAbsoluteDrop || relative < t.minRelativeDrop) return [];
    return [
      {
        kind: 'funnel_drop',
        source: 'events',
        funnel: c.funnel,
        step: c.step,
        severity: level(relative, 0.35, 0.5),
        numbers: {
          conversion: round(now, 3),
          baselineConversion: round(before, 3),
          entrants: c.entrants,
          baselineEntrants: b.entrants,
          thresholds: { ...t },
        },
      },
    ];
  });
}

/** rows: [{ page, element, sessions }] from the rage-click query. */
export function rageSignals(rows) {
  const t = THRESHOLDS.rage;
  return rows
    .filter((r) => r.sessions >= t.minSessions)
    .map((r) => ({
      kind: 'rage_click',
      source: 'events',
      page: r.page,
      element: r.element,
      severity: level(r.sessions, 20, 50),
      numbers: { sessions: r.sessions, thresholds: { ...t } },
    }));
}

/** rows: [{ fingerprint, route, page, error_sessions, exits }] from the quick-exit query. */
export function quickExitSignals(rows) {
  const t = THRESHOLDS.quickExit;
  return rows.flatMap((r) => {
    const share = r.exits / r.error_sessions;
    if (r.exits < t.minSessions || share < t.minExitShare) return [];
    return [
      {
        kind: 'quick_exit',
        source: 'events',
        route: r.route,
        page: r.page,
        fingerprint: r.fingerprint,
        severity: level(r.exits, 20, 50),
        numbers: {
          errorSessions: r.error_sessions,
          exits: r.exits,
          exitShare: round(share, 2),
          thresholds: { ...t },
        },
      },
    ];
  });
}
