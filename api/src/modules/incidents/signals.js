import { conversions, loadFunnelSubjects } from '../insights/funnels.js';
import {
  THRESHOLDS,
  errorSignals,
  funnelSignals,
  latencySignals,
  quickExitSignals,
  rageSignals,
  seriesToLatency,
} from './detect.js';

const DAY_MS = 86400000;

/** Detection windows: current = last N minutes; baseline = the preceding D days. */
export function windows(now, detect) {
  const to = now;
  const from = new Date(to.getTime() - detect.windowMinutes * 60000);
  const baseFrom = new Date(from.getTime() - detect.baselineDays * DAY_MS);
  const funnelFrom = new Date(to.getTime() - DAY_MS);
  const funnelBaseFrom = new Date(funnelFrom.getTime() - detect.baselineDays * DAY_MS);
  return { from, to, baseFrom, funnelFrom, funnelBaseFrom };
}

async function fromEvents(queries, db, env, w) {
  const [cur, base, errCur, errBase, rage, exits, fCur, fBase] = await Promise.all([
    queries.routeLatency(env, w.from, w.to),
    queries.routeLatency(env, w.baseFrom, w.from),
    queries.errorCounts(env, w.from, w.to),
    queries.errorCounts(env, w.baseFrom, w.from),
    queries.rageClicks(env, w.from, w.to),
    queries.quickExits(env, w.from, w.to),
    loadFunnelSubjects(db, env, w.funnelFrom, w.to),
    loadFunnelSubjects(db, env, w.funnelBaseFrom, w.funnelFrom),
  ]);
  const spans = { windowMs: w.to - w.from, baselineMs: w.from - w.baseFrom };
  return [
    ...latencySignals(cur, base, { source: 'events', minSamples: THRESHOLDS.latency.minSamples }),
    ...errorSignals(errCur, errBase, { source: 'events', ...spans }),
    ...rageSignals(rage),
    ...quickExitSignals(exits),
    ...funnelSignals(conversions(fCur), conversions(fBase)),
  ];
}

async function fromMetrics(metrics, w) {
  const [cur, base] = await Promise.all([
    metrics.latency({ from: w.from, to: w.to, quantile: 0.95 }),
    metrics.latency({ from: w.baseFrom, to: w.from, quantile: 0.95 }),
  ]);
  return latencySignals(seriesToLatency(cur), seriesToLatency(base), {
    source: 'metrics',
    minSamples: THRESHOLDS.latency.minMetricPoints,
  });
}

async function fromErrors(errors, w) {
  const [cur, base] = await Promise.all([
    errors.issues({ from: w.from, to: w.to }),
    errors.issues({ from: w.baseFrom, to: w.from }),
  ]);
  return errorSignals(cur, base, {
    source: 'errors',
    windowMs: w.to - w.from,
    baselineMs: w.from - w.baseFrom,
  });
}

/**
 * Collects every signal for one environment. A failing or unconfigured pull source never
 * stops detection: its error code is reported alongside the signals.
 */
export async function collectSignals({ queries, db, sources }, env, w) {
  const sourceErrors = {};
  const guarded = async (name, slot, run) => {
    if (slot.impl === null) return [];
    try {
      return await run(slot.impl);
    } catch (err) {
      sourceErrors[name] = err.code ?? 'source_failed';
      return [];
    }
  };
  const lists = await Promise.all([
    fromEvents(queries, db, env, w),
    guarded('metrics', sources.metrics, (m) => fromMetrics(m, w)),
    guarded('errors', sources.errors, (e) => fromErrors(e, w)),
  ]);
  return { signals: lists.flat(), sourceErrors };
}

/** Evidence from logs for one route: 5xx lines and slow lines in the window. */
export async function logEvidence(slot, route, w) {
  if (slot.impl === null || !route) return null;
  try {
    const lines = await slot.impl.query({ from: w.from, to: w.to, route });
    return {
      lines: lines.length,
      serverErrors: lines.filter((l) => l.status >= 500).length,
      msgKinds: [...new Set(lines.map((l) => l.msgKind))].sort().slice(0, 10),
    };
  } catch (err) {
    return { error: err.code ?? 'source_failed' };
  }
}
