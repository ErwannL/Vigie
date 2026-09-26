import { assertEnv } from '../../env.js';
import { correlate } from './correlate.js';
import { enrich, upsert } from './detection.js';
import { assertTransition, withHistory } from './lifecycle.js';
import { createReplays, mustGet } from './replay.js';
import { createReporter } from './reporter.js';
import { collectSignals, windows } from './signals.js';

/**
 * Module 1: detect → correlate → store → report, plus replay and resolve.
 * All collaborators are injected; `clock.now()` is the only source of time.
 */
export function createIncidentService(deps) {
  const { repo, queries, adapters, config, clock, audit, log } = deps;
  const report = createReporter(deps);
  const { requestReplay, pollReplays } = createReplays(deps, report);

  async function replaySafely(env, id, targetEnv) {
    try {
      return await requestReplay(env, id, targetEnv, { sub: 'vigie:auto', name: null });
    } catch (err) {
      log.warn({ env, incident: id, code: err.code }, 'auto replay failed');
      return repo.get(env, id);
    }
  }

  /** One detection pass for one environment. */
  async function runDetection(env) {
    assertEnv(env);
    const now = clock.now();
    const w = windows(now, config.detect);
    const sources = adapters.sources[env];
    const { signals, sourceErrors } = await collectSignals(
      { queries, db: deps.db, sources },
      env,
      w,
    );
    const results = [];
    for (const candidate of correlate(signals)) {
      const facts = await enrich(deps, env, candidate, w);
      const { incident, change } = await upsert(repo, env, candidate, facts, now);
      let current = change === 'unchanged' ? incident : await report(incident);
      if (config.autoReplayTarget && (change === 'opened' || change === 'reopened')) {
        current = await replaySafely(env, current.id, config.autoReplayTarget);
      }
      results.push({ id: current.id, key: current.key, change });
    }
    log.info({ env, signals: signals.length, incidents: results.length }, 'detection done');
    return {
      env,
      at: now.toISOString(),
      signals: signals.length,
      incidents: results,
      sourceErrors,
    };
  }

  async function resolve(env, id, operator) {
    const incident = await mustGet(repo, env, id);
    assertTransition(incident.status, 'resolved');
    const updated = await repo.update(env, id, {
      status: 'resolved',
      resolvedVersion: incident.appVersion,
      history: withHistory(incident.history, clock.now(), 'resolved', { by: operator.sub }),
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
    get: (env, id) => mustGet(repo, env, id),
    list: (env, opts) => repo.list(assertEnv(env), opts),
  };
}
