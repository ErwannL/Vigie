import { FUNNELS } from '../../catalogues.js';
import { assertEnv, assertFiguraTarget } from '../../env.js';
import { errorsBySegment, errorsView } from './errors.js';
import { funnelView, groupSubjects, loadFunnelSubjects } from './funnels.js';
import { landingClicks, landingConversions, landingCounts, landingView } from './landing.js';
import { derivePersonaSet, personaFeatures, personaGroups } from './personas.js';
import { accountRows, segmentsView } from './segments.js';
import {
  activeUsers,
  dailyUsage,
  dayString,
  daysBefore,
  featureByPlan,
  featureCounts,
  featureOutcomes,
  usageView,
} from './usage.js';

export const FUNNEL_GROUPINGS = Object.freeze(['plan', 'device']);

function clampDays(days) {
  const n = Number.parseInt(days, 10);
  return Number.isNaN(n) ? 28 : Math.min(Math.max(n, 1), 90);
}

/**
 * The window of an insight and whether analytics-consent data exists in it. Behavioural
 * insights return only this meta (`analytics.hasData = false`) when there is none, instead of
 * empty or misleading numbers.
 */
async function frame({ events, clock }, env, days) {
  assertEnv(env);
  const to = clock.now();
  const w = { days: clampDays(days), to };
  w.from = daysBefore(to, w.days);
  const analyticsEvents = await events.countAnalytics(env, w.from, to);
  const meta = {
    env,
    window: { from: w.from.toISOString(), to: to.toISOString(), days: w.days },
    analytics: { events: analyticsEvents, hasData: analyticsEvents > 0 },
  };
  return { w, meta };
}

async function usage(deps, env, days) {
  const { w, meta } = await frame(deps, env, days);
  if (!meta.analytics.hasData) return meta;
  const { db } = deps;
  const [counts, active, byPlan, outcomes, daily] = await Promise.all([
    featureCounts(db, env, w.from, w.to),
    activeUsers(db, env, w.from, w.to),
    featureByPlan(db, env, w.from, w.to),
    featureOutcomes(db, env, w.from, w.to),
    dailyUsage(db, env, dayString(w.from), dayString(w.to)),
  ]);
  return { ...meta, ...usageView({ counts, active, byPlan, outcomes, daily }) };
}

async function landing(deps, env, days) {
  const { w, meta } = await frame(deps, env, days);
  if (!meta.analytics.hasData) return meta;
  const [counts, clicks, conversions] = await Promise.all([
    landingCounts(deps.db, env, w.from, w.to),
    landingClicks(deps.db, env, w.from, w.to),
    landingConversions(deps.db, env, w.from, w.to),
  ]);
  return { ...meta, ...landingView({ counts, clicks, conversions }) };
}

async function funnels(deps, env, days, by = null) {
  const { w, meta } = await frame(deps, env, days);
  if (!meta.analytics.hasData) return meta;
  const grouping = FUNNEL_GROUPINGS.includes(by) ? by : null;
  const subjects = await loadFunnelSubjects(deps.db, env, w.from, w.to);
  const groups = grouping
    ? [...groupSubjects(subjects, grouping).entries()].sort((a, b) => a[0].localeCompare(b[0]))
    : [];
  return {
    ...meta,
    by: grouping,
    funnels: FUNNELS.items.map((funnel) => ({
      key: funnel.key,
      steps: funnelView(funnel, subjects),
      groups: groups.map(([value, list]) => ({ value, steps: funnelView(funnel, list) })),
    })),
  };
}

async function segments(deps, env, days) {
  const { w, meta } = await frame(deps, env, days);
  if (!meta.analytics.hasData) return meta;
  return { ...meta, ...segmentsView(await accountRows(deps.db, env, w.from, w.to)) };
}

async function errors(deps, env, days) {
  const { w, meta } = await frame(deps, env, days);
  return { ...meta, ...errorsView(await errorsBySegment(deps.db, env, w.from, w.to)) };
}

async function previewPersonas(deps, sourceEnv, targetEnv, days) {
  assertFiguraTarget(targetEnv);
  const { w, meta } = await frame(deps, sourceEnv, days);
  if (!meta.analytics.hasData) return { ...meta, set: null };
  const [groups, features, subjects] = await Promise.all([
    personaGroups(deps.db, sourceEnv, w.from, w.to),
    personaFeatures(deps.db, sourceEnv, w.from, w.to),
    loadFunnelSubjects(deps.db, sourceEnv, w.from, w.to),
  ]);
  const window = meta.window;
  return {
    ...meta,
    set: derivePersonaSet({ sourceEnv, targetEnv, window, groups, features, subjects }),
  };
}

async function pushPersonas(deps, sourceEnv, targetEnv, days, operator) {
  const preview = await previewPersonas(deps, sourceEnv, targetEnv, days);
  if (preview.set === null || preview.set.personas.length === 0) {
    return { ...preview, pushed: false };
  }
  const { accepted } = await deps.adapters.figura.pushPersonas(preview.set);
  const saved = await deps.personaSets.save(sourceEnv, {
    targetEnv,
    payload: preview.set,
    accepted,
    pushedBy: operator.sub,
  });
  await deps.audit.record({
    operator: operator.sub,
    operatorName: operator.name,
    action: 'personas.push',
    env: sourceEnv,
    details: { targetEnv, personas: preview.set.personas.length, accepted },
  });
  return { ...preview, pushed: true, accepted, id: saved.id };
}

const INSIGHTS = { usage, landing, funnels, segments, errors, previewPersonas, pushPersonas };

/** Module 2. Every call takes a required environment and works on one time window. */
export function createInsightsService(deps) {
  return Object.fromEntries(
    Object.entries(INSIGHTS).map(([name, fn]) => [name, (...args) => fn(deps, ...args)]),
  );
}
