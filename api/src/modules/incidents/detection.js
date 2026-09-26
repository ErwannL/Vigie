import { filterForKey, incidentTitle, maxSeverity } from './correlate.js';
import { withHistory } from './lifecycle.js';
import { summarizeProfile } from './profile.js';
import { logEvidence } from './signals.js';

/** Incidents older than this since their last signal are not merged into: a new one opens. */
export const CORRELATION_WINDOW_MS = 24 * 3600 * 1000;
const TRIGGER_LIMIT = 20;
const ACTIVE = ['open', 'reopened', 'reproducing', 'confirmed', 'not_reproduced'];
const NO_FACTS = {
  segments: { device: [], plan: [] },
  features: [],
  appVersion: null,
  sinceVersion: null,
};
const union = (a, b) => [...new Set([...a, ...b])].sort();

/** Who is affected, since which version, plus the triggering numbers and log evidence. */
export async function enrich({ queries, adapters }, env, candidate, w) {
  const filter = filterForKey(candidate.key);
  const facts = filter
    ? summarizeProfile(
        await queries.profile(env, filter, w.from, w.to),
        await queries.versionsBefore(env, filter, w.baseFrom, w.from),
      )
    : NO_FACTS;
  const logs = await logEvidence(adapters.sources[env].logs, candidate.routes[0], w);
  const at = w.to.toISOString();
  const triggers = candidate.signals.map((s) => ({ ...s, detectedAt: at }));
  if (logs) triggers.push({ kind: 'log_evidence', source: 'logs', numbers: logs, detectedAt: at });
  return { ...facts, triggers };
}

function created(candidate, facts, now) {
  return {
    key: candidate.key,
    status: 'open',
    severity: candidate.severity,
    title: incidentTitle(candidate),
    kinds: candidate.kinds,
    routes: candidate.routes,
    pages: candidate.pages,
    features: facts.features,
    fingerprints: candidate.fingerprints,
    segments: facts.segments,
    triggers: facts.triggers,
    appVersion: facts.appVersion,
    sinceVersion: facts.sinceVersion,
    firstSeen: now,
    lastSeen: now,
    history: withHistory([], now, 'opened'),
  };
}

function merged(existing, candidate, facts, now) {
  const kinds = union(existing.kinds, candidate.kinds);
  return {
    kinds,
    title: incidentTitle({ key: existing.key, kinds }),
    severity: maxSeverity(existing.severity, candidate.severity),
    routes: union(existing.routes, candidate.routes),
    pages: union(existing.pages, candidate.pages),
    features: union(existing.features, facts.features),
    fingerprints: union(existing.fingerprints, candidate.fingerprints),
    segments: facts.segments,
    triggers: [...existing.triggers, ...facts.triggers].slice(-TRIGGER_LIMIT),
    appVersion: facts.appVersion ?? existing.appVersion,
    sinceVersion: existing.sinceVersion ?? facts.sinceVersion,
    lastSeen: now,
  };
}

/**
 * Applies a candidate to the latest incident with the same key:
 * active and recent → updated; resolved → reopened only after a new appVersion
 * (else left resolved, noted in history); otherwise a new incident is opened.
 */
export async function upsert(repo, env, candidate, facts, now) {
  const existing = await repo.latestByKey(env, candidate.key);
  const recent = existing && now - new Date(existing.lastSeen) <= CORRELATION_WINDOW_MS;
  if (existing && ACTIVE.includes(existing.status) && recent) {
    const patch = merged(existing, candidate, facts, now);
    patch.history = withHistory(existing.history, now, 'signal');
    return { incident: await repo.update(env, existing.id, patch), change: 'updated' };
  }
  if (existing && existing.status === 'resolved') {
    const newVersion = facts.appVersion !== null && facts.appVersion !== existing.resolvedVersion;
    const patch = merged(existing, candidate, facts, now);
    if (!newVersion) {
      patch.history = withHistory(existing.history, now, 'seen_before_new_version');
      return { incident: await repo.update(env, existing.id, patch), change: 'unchanged' };
    }
    patch.status = 'reopened';
    patch.history = withHistory(existing.history, now, 'reopened', {
      appVersion: facts.appVersion,
    });
    return { incident: await repo.update(env, existing.id, patch), change: 'reopened' };
  }
  return { incident: await repo.create(env, created(candidate, facts, now)), change: 'opened' };
}
