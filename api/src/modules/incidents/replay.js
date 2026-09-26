import { assertEnv, assertFiguraTarget } from '../../env.js';
import { AppError } from '../../errors.js';
import { filterForKey } from './correlate.js';
import { assertTransition, statusAfterReplay, withHistory } from './lifecycle.js';
import { buildScenario, commonPath } from './scenario.js';
import { windows } from './signals.js';

export async function mustGet(repo, env, id) {
  assertEnv(env);
  const incident = await repo.get(env, id);
  if (incident === null) throw new AppError('incident_not_found', 404);
  return incident;
}

/**
 * Reproduction through Figura: build a scenario from the aggregated common path, start the
 * run, then poll it until it settles. The target is dev or recette, whatever the source.
 */
export function createReplays({ repo, queries, adapters, config, clock, audit, log }, report) {
  async function requestReplay(env, id, targetEnv, operator) {
    assertFiguraTarget(targetEnv);
    const incident = await mustGet(repo, env, id);
    assertTransition(incident.status, 'reproducing');
    const w = windows(clock.now(), config.detect);
    const filter = filterForKey(incident.key);
    const rows = filter ? await queries.pathsBefore(env, filter, w.baseFrom, w.to) : [];
    const scenario = buildScenario({ incident, targetEnv, path: commonPath(rows) });
    const { runId } = await adapters.figura.replay(scenario);
    const now = clock.now();
    const updated = await repo.update(env, id, {
      status: 'reproducing',
      replay: {
        runId,
        sourceEnv: env,
        targetEnv,
        state: 'queued',
        scenario,
        evidence: null,
        requestedAt: now.toISOString(),
        requestedBy: operator.sub,
        previousStatus: incident.status,
      },
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
    const updated = await repo.update(incident.env, incident.id, {
      status: statusAfterReplay(status.state, incident.replay.previousStatus),
      replay,
      history: withHistory(incident.history, clock.now(), `replay_${status.state}`),
    });
    return report(updated);
  }

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

  return { requestReplay, pollReplays };
}
