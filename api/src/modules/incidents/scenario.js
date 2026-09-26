import { FEATURES } from '../../catalogues.js';
import { isElementId, isTemplate } from '../../collector/sanitize.js';
import { assertFiguraTarget, assertEnv } from '../../env.js';
import { AppError } from '../../errors.js';

export const SCENARIO_SCHEMA = 1;
/** A path is only used when at least this many sessions share it: never one user's trail. */
export const MIN_PATH_SESSIONS = 5;
const PATH_LENGTH = 4;
const ACTIONS = ['visit', 'click', 'signup', 'login', 'use_feature', 'wait'];

function toStep(row) {
  if (row.type === 'page_view' && row.page) return { action: 'visit', target: row.page };
  if (row.type === 'feature_use' && row.feature) return { action: 'use_feature', target: row.feature };
  if (row.type === 'click' && row.element) return { action: 'click', target: row.element };
  if (row.type === 'login' || row.type === 'signup') return { action: row.type, target: null };
  return null;
}

/**
 * Aggregates per-session navigation rows into the most common final path (up to 4 steps).
 * Returns { steps, sessions } or null when no path is shared by MIN_PATH_SESSIONS sessions.
 */
export function commonPath(rows) {
  const bySession = new Map();
  for (const row of rows) {
    const step = toStep(row);
    if (step === null) continue;
    const steps = bySession.get(row.session) ?? [];
    const last = steps.at(-1);
    if (!last || last.action !== step.action || last.target !== step.target) steps.push(step);
    bySession.set(row.session, steps);
  }
  const counts = new Map();
  for (const steps of bySession.values()) {
    const key = JSON.stringify(steps.slice(-PATH_LENGTH));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const best = [...counts.entries()]
    .filter(([, n]) => n >= MIN_PATH_SESSIONS)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || (a[0] < b[0] ? -1 : 1))[0];
  return best ? { steps: JSON.parse(best[0]), sessions: best[1] } : null;
}

function topValue(segments, dimension, fallback) {
  return segments[dimension]?.[0]?.value ?? fallback;
}

function expectation(incident) {
  const latency = incident.triggers.find((t) => t.kind === 'latency');
  if (latency) return { maxDurationMs: latency.numbers.baselineP95Ms, status: 200 };
  return { status: 200 };
}

/** Builds a Figura scenario from an incident and an aggregated path (never raw user data). */
export function buildScenario({ incident, targetEnv, path }) {
  const steps = path ? path.steps.map((s) => ({ ...s })) : [];
  if (steps.length === 0) steps.push({ action: 'visit', target: incident.pages[0] ?? '/' });
  steps[steps.length - 1].expect = expectation(incident);
  const scenario = {
    schema: SCENARIO_SCHEMA,
    kind: 'vigie.scenario',
    incidentId: incident.id,
    sourceEnv: incident.env,
    targetEnv,
    persona: {
      plan: topValue(incident.segments, 'plan', 'free'),
      device: topValue(incident.segments, 'device', 'desktop'),
      locale: 'en',
    },
    steps,
    watch: { routes: incident.routes, fingerprints: incident.fingerprints },
    basis: { pathSessions: path ? path.sessions : 0 },
  };
  return validateScenario(scenario);
}

function validTarget(step) {
  if (step.target === null) return step.action === 'login' || step.action === 'signup';
  if (step.action === 'use_feature') return FEATURES.items.includes(step.target);
  if (step.action === 'click') return isElementId(step.target);
  return isTemplate(step.target);
}

/** Checks that a scenario only contains catalogue keys and templates, and targets dev/recette. */
export function validateScenario(scenario) {
  assertEnv(scenario.sourceEnv);
  assertFiguraTarget(scenario.targetEnv);
  const ok =
    scenario.schema === SCENARIO_SCHEMA &&
    scenario.steps.length > 0 &&
    scenario.steps.every((s) => ACTIONS.includes(s.action) && validTarget(s));
  if (!ok) throw new AppError('invalid_scenario', 500);
  return scenario;
}
