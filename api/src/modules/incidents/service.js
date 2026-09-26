import { assertEnv, assertFiguraTarget } from '../../env.js';
import { AppError } from '../../errors.js';
import { correlate, filterForKey, incidentTitle, maxSeverity } from './correlate.js';
import { assertTransition, statusAfterReplay, withHistory } from './lifecycle.js';
import { summarizeProfile } from './profile.js';
import { issuePayload } from './report.js';
import { buildScenario, commonPath } from './scenario.js';
import { collectSignals, logEvidence, windows } from './signals.js';

/** Incidents older than this since their last signal are not merged into: a new one opens. */
export const CORRELATION_WINDOW_MS = 24 * 3600 * 1000;
const TRIGGER_LIMIT = 20;
const ACTIVE = ['open', 'reopened', 'reproducing', 'confirmed', 'not_reproduced'];
const union = (a, b) => [...new Set([...a, ...b])].sort();

/**
 * Module 1 orchestration: detect → correlate → store → report, plus replay and resolve.
 * All collaborators are injected; `clock.now()` is the only source of time.
 */
export function createIncidentService(deps) {
  const { repo, queries, adapters, config, clock, audit, log } = deps;

  async function report(incident) {
    const sink = adapters.issues.impl;
    if (sink === null) return incident;
    try {
      const payload = issuePayload(incident, config.publicUrl);
      if (incident.issueRef) {
        await sink.update(incident.issueRef, payload);
        return incident;
      }
      const { ref } = await sink.open(payload);
      return repo.update(incident.env, incident.id, { issueRef: ref });
    } catch (err) {
      log.warn({ code: err.code, incident: incident.id }, 'issue sink failed');
      return incident;
    }
  }

  async function enrich(env, candidate, w) {
    const filter = filterForKey(candidate.key);
    const facts = filter
      ? summarizeProfile(
          await queries.profile(env, filter, w.from, w.to),
          await queries.versionsBefore(env, filter, w.baseFrom, w.from),
        )
      : { segments: { device: [], plan: [] }, features: [], appVersion: null, sinceVersion: null };
    const logs = await logEvidence(adapters.sources[env].logs, candidate.routes[0], w);
    const at = w.to.toISOString();
    const triggers = candidate.signals.map((s) => ({ ...s, detectedAt: at }));
    if (logs) triggers.push({ kind: 'log_evidence', source: 'logs', numbers: logs, detectedAt: at });
    return { ...facts, triggers };
  }

  function freshFields(candidate, facts) {
    return {
      kinds: candidate.kinds,
      routes: candidate.routes,
      pages: candidate.pages,
      features: facts.features,
      fingerprints: candidate.fingerprints,
      segments: facts.segments,
    };
  }

  async function create(env, candidate, facts, now) {
    return repo.create(env, {
      key: candidate.key,
      status: 'open',
      severity: candidate.severity,
      title: incidentTitle(candidate),
      ...freshFields(candidate, facts),
      triggers: facts.triggers,
      appVersion: facts.appVersion,
      sinceVersion: facts.sinceVersion,
      firstSeen: now,
      lastSeen: now,
      history: withHistory([], now, 'opened'),
    });
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

  /** Decides what a candidate does to the latest incident with the same key. */
  async function upsert(env, candidate, facts, now) {
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
      patch.history = withHistory(existing.history, now, 'reopened', { appVersion: facts.appVersion });
      return { incident: await repo.update(env, existing.id, patch), change: 'reopened' };
    }
    return { incident: await create(env, candidate, facts, now), change: 'opened' };
  }

  /** One detection pass for one environment. */
  async function runDetection(env) {
    assertEnv(env);
    const now = clock.now();
    const w = windows(now, config.detect);
    const { signals, sourceErrors } = await collectSignals(
      { queries, db: deps.db, sources: adapters.sources[env] },
      env,
      w,
    );
    const results = [];
    for (const candidate of correlate(signals)) {
      const facts = await enrich(env, candidate, w);
      const { incident, change } = await upsert(env, candidate, facts, now);
      let current = change === 'unchanged' ? incident : await report(incident);
      if (config.autoReplayTarget && (change === 'opened' || change === 'reopened')) {
        current = await replaySafely(env, current.id, config.autoReplayTarget, 'vigie:auto');
      }
      results.push({ id: current.id, key: current.key, change });
    }
    log.info({ env, signals: signals.length, incidents: results.length }, 'detection done');
    return { env, at: now.toISOString(), signals: signals.length, incidents: results, sourceErrors };
  }

  async function replaySafely(env, id, targetEnv, operator) {
    try {
      return await requestReplay(env, id, targetEnv, { sub: operator, name: null });
    } catch (err) {
      log.warn({ env, incident: id, code: err.code }, 'auto replay failed');
      return repo.get(env, id);
    }
  }

  async function mustGet(env, id) {
    assertEnv(env);
    const incident = await repo.get(env, id);
    if (incident === null) throw new AppError('incident_not_found', 404);
    return incident;
  }

  /** Builds a scenario from the aggregated common path and starts a Figura replay. */
  async function requestReplay(env, id, targetEnv, operator) {
    assertFiguraTarget(targetEnv);
    const incident = await mustGet(env, id);
    assertTransition(incident.status, 'reproducing');
    const w = windows(clock.now(), config.detect);
    const filter = filterForKey(incident.key);
    const rows = filter ? await queries.pathsBefore(env, filter, w.baseFrom, w.to) : [];
    const scenario = buildScenario({ incident, targetEnv, path: commonPath(rows) });
    const { runId } = await adapters.figura.replay(scenario);
    const now = clock.now();
    const replay = {
      runId,
      sourceEnv: env,
      targetEnv,
      state: 'queued',
      scenario,
      evidence: null,
      requestedAt: now.toISOString(),
      requestedBy: operator.sub,
      previousStatus: incident.status,
    };
    const updated = await repo.update(env, id, {
      status: 'reproducing',
      replay,
      history: withHistory(incident.history, now, 'reproducing', { targetEnv, runId }),
    });
    await audit.record({
      operator: operator.sub,
      operatorName: operator.name,
      action: 'incident.replay',
      env,
      details: { incident: id, targetEnv, runId },
    });
    return report(updated);
  }

  async function pollOne(incident) {
    const status = await adapters.figura.status(incident.replay.runId);
    const replay = { ...incident.replay, state: status.state, evidence: status.evidence ?? null };
    if (status.state === 'queued' || status.state === 'running') {
      if (status.state === incident.replay.state) return null;
      return repo.update(incident.env, incident.id, { replay });
    }
    const now = clock.now();
    const next = statusAfterReplay(status.state, incident.replay.previousStatus);
    const updated = await repo.update(incident.env, incident.id, {
      status: next,
      replay,
      history: withHistory(incident.history, now, `replay_${status.state}`),
    });
    return report(updated);
  }

  /** Polls Figura for every incident being reproduced in one environment. */
  async function pollReplays(env) {
    const reproducing = await repo.list(assertEnv(env), { status: 'reproducing' });
    let settled = 0;
    for (const incident of reproducing) {
      try {
        const updated = await pollOne(incident);
        if (updated && updated.status !== 'reproducing') settled += 1;
      } catch (err) {
        log.warn({ env, incident: incident.id, code: err.code }, 'replay status failed');
      }
    }
    return { env, polled: reproducing.length, settled };
  }

  async function resolve(env, id, operator) {
    const incident = await mustGet(env, id);
    assertTransition(incident.status, 'resolved');
    const now = clock.now();
    const updated = await repo.update(env, id, {
      status: 'resolved',
      resolvedVersion: incident.appVersion,
      history: withHistory(incident.history, now, 'resolved', { by: operator.sub }),
    });
    await audit.record({
      operator: operator.sub,
      operatorName: operator.name,
      action: 'incident.resolve',
      env,
      details: { incident: id },
    });
    return report(updated);
  }

  return {
    runDetection,
    requestReplay,
    pollReplays,
    resolve,
    get: mustGet,
    list: (env, opts) => repo.list(assertEnv(env), opts),
  };
}
