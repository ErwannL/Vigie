import { FUNNELS } from '../../catalogues.js';
import { assertEnv } from '../../env.js';
import { mask, safeRate } from './kanon.js';

const DAY_MS = 86400000;

function matches(match, e) {
  return Object.entries(match).every(([field, value]) => e[field] === value);
}

/** Index of the furthest step a subject reached, following step order and time. */
export function reachedSteps(funnel, events) {
  let i = 0;
  let start = null;
  for (const e of events) {
    const step = funnel.steps[i];
    const at = new Date(e.occurred_at).getTime();
    const late = step.minDaysAfterStart === undefined || at - start >= step.minDaysAfterStart * DAY_MS;
    if (matches(step.match, e) && late) {
      start ??= at;
      i += 1;
      if (i === funnel.steps.length) break;
    }
  }
  return i;
}

/** Raw (unmasked) counts of subjects reaching each step. Internal use only. */
export function stepCounts(funnel, subjects) {
  const counts = funnel.steps.map(() => 0);
  for (const events of subjects) {
    const reached = reachedSteps(funnel, events);
    for (let s = 0; s < reached; s += 1) counts[s] += 1;
  }
  return counts;
}

/** Masked, displayable funnel: count, conversion from previous step and drop-off per step. */
export function funnelView(funnel, subjects) {
  const counts = stepCounts(funnel, subjects);
  return funnel.steps.map((step, i) => {
    const conversion = i === 0 ? null : safeRate(counts[i], counts[i - 1]);
    return {
      key: step.key,
      count: mask(counts[i]),
      conversion,
      dropOff: conversion === null ? null : Number((1 - conversion).toFixed(3)),
    };
  });
}

/** Groups visitor event lists by a segment attribute taken from their events. */
export function groupSubjects(subjects, by) {
  const groups = new Map();
  for (const events of subjects) {
    const values = events.map((e) => e[by]).filter((v) => v !== null);
    const value = values.length > 0 ? values[values.length - 1] : 'unknown';
    if (!groups.has(value)) groups.set(value, []);
    groups.get(value).push(events);
  }
  return groups;
}

/** Conversion into each step (for detection): [{ funnel, step, entrants, converted }]. */
export function conversions(subjects) {
  return FUNNELS.items.flatMap((funnel) => {
    const counts = stepCounts(funnel, subjects);
    return funnel.steps.slice(1).flatMap((step, i) =>
      step.minDaysAfterStart === undefined
        ? [{ funnel: funnel.key, step: step.key, entrants: counts[i], converted: counts[i + 1] }]
        : [],
    );
  });
}

/** Loads analytics events relevant to funnels, grouped per visitor, in time order. */
export async function loadFunnelSubjects(db, env, from, to) {
  assertEnv(env);
  const { rows } = await db.query(
    `SELECT visitor, type, source, page, feature, plan, device, occurred_at FROM events
     WHERE env = $1 AND consent = 'analytics' AND visitor IS NOT NULL
       AND occurred_at >= $2 AND occurred_at < $3
       AND type IN ('page_view', 'signup', 'feature_use', 'login', 'paywall_hit', 'upgrade')
     ORDER BY visitor, occurred_at`,
    [env, from, to],
  );
  const byVisitor = new Map();
  for (const { visitor, ...event } of rows) {
    if (!byVisitor.has(visitor)) byVisitor.set(visitor, []);
    byVisitor.get(visitor).push(event);
  }
  return [...byVisitor.values()];
}
