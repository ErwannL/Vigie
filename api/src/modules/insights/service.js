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
 * Module 2. Every call takes a required environment and works on one time window.
 * Behavioural insights only use `analytics`-consent events; when there are none they return
 * `analytics.hasData = false` instead of empty or misleading numbers.
 */
export function createInsightsService({ db, events, clock, adapters, personaSets, audit }) {
  async function frame(env, days) {
    assertEnv(env);
    const to = clock.now();
    const window = { days: clampDays(days), to };
    window.from = daysBefore(to, window.days);
    const analyticsEvents = await events.countAnalytics(env, window.from, to);
    const meta = {
      env,
      window: { from: window.from.toISOString(), to: to.toISOString(), days: window.days },
      analytics: { events: analyticsEvents, hasData: analyticsEvents > 0 },
    };
    return { window, meta };
  }

  async function usage(env, days) {
    const { window: w, meta } = await frame(env, days);
    if (!meta.analytics.hasData) return meta;
    const [counts, active, byPlan, outcomes, daily] = await Promise.all([
      featureCounts(db, env, w.from, w.to),
      activeUsers(db, env, w.from, w.to),
      featureByPlan(db, env, w.from, w.to),
      featureOutcomes(db, env, w.from, w.to),
      dailyUsage(db, env, dayString(w.from), dayString(w.to)),
    ]);
    return { ...meta, ...usageView({ counts, active, byPlan, outcomes, daily }) };
  }

  async function landing(env, days) {
    const { window: w, meta } = await frame(env, days);
    if (!meta.analytics.hasData) return meta;
    const [counts, clicks, conversions] = await Promise.all([
      landingCounts(db, env, w.from, w.to),
      landingClicks(db, env, w.from, w.to),
      landingConversions(db, env, w.from, w.to),
    ]);
    return { ...meta, ...landingView({ counts, clicks, conversions }) };
  }

  async function funnels(env, days, by = null) {
    const { window: w, meta } = await frame(env, days);
    if (!meta.analytics.hasData) return meta;
    const grouping = FUNNEL_GROUPINGS.includes(by) ? by : null;
    const subjects = await loadFunnelSubjects(db, env, w.from, w.to);
    const groups = grouping ? [...groupSubjects(subjects, grouping).entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)) : [];
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

  async function segments(env, days) {
    const { window: w, meta } = await frame(env, days);
    if (!meta.analytics.hasData) return meta;
    return { ...meta, ...segmentsView(await accountRows(db, env, w.from, w.to)) };
  }

  async function errors(env, days) {
    const { window: w, meta } = await frame(env, days);
    return { ...meta, ...errorsView(await errorsBySegment(db, env, w.from, w.to)) };
  }

  async function previewPersonas(sourceEnv, targetEnv, days) {
    assertFiguraTarget(targetEnv);
    const { window: w, meta } = await frame(sourceEnv, days);
    if (!meta.analytics.hasData) return { ...meta, set: null };
    const [groups, features, subjects] = await Promise.all([
      personaGroups(db, sourceEnv, w.from, w.to),
      personaFeatures(db, sourceEnv, w.from, w.to),
      loadFunnelSubjects(db, sourceEnv, w.from, w.to),
    ]);
    const set = derivePersonaSet({ sourceEnv, targetEnv, window: meta.window, groups, features, subjects });
    return { ...meta, set };
  }

  async function pushPersonas(sourceEnv, targetEnv, days, operator) {
    const preview = await previewPersonas(sourceEnv, targetEnv, days);
    if (preview.set === null || preview.set.personas.length === 0) {
      return { ...preview, pushed: false };
    }
    const { accepted } = await adapters.figura.pushPersonas(preview.set);
    const saved = await personaSets.save(sourceEnv, {
      targetEnv,
      payload: preview.set,
      accepted,
      pushedBy: operator.sub,
    });
    await audit.record({
      operator: operator.sub,
      operatorName: operator.name,
      action: 'personas.push',
      env: sourceEnv,
      details: { targetEnv, personas: preview.set.personas.length, accepted },
    });
    return { ...preview, pushed: true, accepted, id: saved.id };
  }

  return { usage, landing, funnels, segments, errors, previewPersonas, pushPersonas };
}
