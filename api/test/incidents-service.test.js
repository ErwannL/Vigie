import { afterAll, expect, test, vi } from 'vitest';
import { createFakeFigura } from '../src/adapters/figura/fake.js';
import { createFiguraClient } from '../src/adapters/figura/client.js';
import { NOW, ago, apiEvents, ingest, slowRouteData } from './factories.js';
import { fixedClock, logSink, makeEvent, testContainer, testDb } from './helpers.js';

afterAll(async () => (await testDb()).close());

const operator = { sub: 'op-1', name: 'Ada' };
const noFixtures = (c) => {
  for (const env of ['dev', 'recette', 'prod']) {
    for (const kind of ['logs', 'metrics', 'errors'])
      c.adapters.sources[env][kind] = { status: 'x', impl: null };
  }
  return c;
};

async function setup(vars = {}) {
  const clock = fixedClock(NOW.toISOString());
  const c = noFixtures(await testContainer({ clock, vars }));
  return { c, clock, svc: c.services.incidents };
}

test('detects a slow route, explains it, and opens an issue', async () => {
  const { c, svc } = await setup();
  await ingest(c, 'prod', slowRouteData());
  const result = await svc.runDetection('prod');
  expect(result).toMatchObject({
    env: 'prod',
    signals: 1,
    incidents: [{ id: 1, change: 'opened' }],
  });
  const [incident] = await svc.list('prod');
  expect(incident).toMatchObject({
    key: 'route:/api/boards/:boardId',
    status: 'open',
    severity: 'high',
    kinds: ['latency'],
    features: ['card.move'],
    appVersion: '2.4.0',
    sinceVersion: '2.4.0',
    segments: { device: [{ value: 'mobile', share: 1 }], plan: [{ value: 'pro', share: 1 }] },
    issueRef: 'FAKE-1',
  });
  expect(incident.triggers[0].numbers).toMatchObject({
    samples: 40,
    baselineSamples: 60,
    baselineP95Ms: 156,
  });
  expect(c.adapters.issues.impl.issues.get('FAKE-1')).toMatchObject({ incidentId: 1, env: 'prod' });
  expect(await svc.list('recette')).toEqual([]);
  expect(await c.services.incidents.runDetection('recette')).toMatchObject({
    signals: 0,
    incidents: [],
  });
});

test('a repeated signal updates the same incident; a stale one opens a new incident', async () => {
  const { c, svc, clock } = await setup();
  await ingest(c, 'prod', slowRouteData());
  await svc.runDetection('prod');
  clock.advance(5 * 60000);
  const second = await svc.runDetection('prod');
  expect(second.incidents).toEqual([
    { id: 1, key: 'route:/api/boards/:boardId', change: 'updated' },
  ]);
  const updated = await svc.get('prod', 1);
  expect(updated.triggers).toHaveLength(2);
  expect(updated.history.map((h) => h.event)).toEqual(['opened', 'signal']);
  expect(c.adapters.issues.impl.issues.size).toBe(1);
  await c.repos.incidents.update('prod', 1, { lastSeen: new Date('2026-08-30T00:00:00Z') });
  expect((await svc.runDetection('prod')).incidents[0]).toMatchObject({ id: 2, change: 'opened' });
});

test('resolved incidents reopen only when the signal returns after a new appVersion', async () => {
  const { c, svc } = await setup();
  await ingest(c, 'prod', slowRouteData());
  await svc.runDetection('prod');
  const resolved = await svc.resolve('prod', 1, operator);
  expect(resolved).toMatchObject({ status: 'resolved', resolvedVersion: '2.4.0' });
  const same = await svc.runDetection('prod');
  expect(same.incidents[0].change).toBe('unchanged');
  expect((await svc.get('prod', 1)).status).toBe('resolved');
  await c.repos.incidents.update('prod', 1, { resolvedVersion: '2.3.9' });
  const again = await svc.runDetection('prod');
  expect(again.incidents[0].change).toBe('reopened');
  const reopened = await svc.get('prod', 1);
  expect(reopened.status).toBe('reopened');
  expect(reopened.history.at(-1)).toMatchObject({ event: 'reopened', appVersion: '2.4.0' });
  const audit = await c.db.query(
    "SELECT action, operator_name FROM audit_log WHERE action = 'incident.resolve'",
  );
  expect(audit.rows).toEqual([{ action: 'incident.resolve', operator_name: 'Ada' }]);
});

test('a resolved incident without any app version stays resolved', async () => {
  const { c, svc } = await setup();
  const events = slowRouteData().map((e) => ({ ...e, context: { device: e.context.device } }));
  await ingest(c, 'prod', events);
  await svc.runDetection('prod');
  await svc.resolve('prod', 1, operator);
  expect((await svc.runDetection('prod')).incidents[0].change).toBe('unchanged');
});

test('replay: prod incident reproduced in recette, then confirmed', async () => {
  const { c, svc } = await setup();
  await ingest(c, 'prod', slowRouteData());
  await svc.runDetection('prod');
  const reproducing = await svc.requestReplay('prod', 1, 'recette', operator);
  expect(reproducing.status).toBe('reproducing');
  expect(reproducing.replay).toMatchObject({
    runId: 'recette:fake-1',
    sourceEnv: 'prod',
    targetEnv: 'recette',
    state: 'queued',
    previousStatus: 'open',
    requestedBy: 'op-1',
  });
  expect(reproducing.replay.scenario.steps).toEqual([
    { action: 'visit', target: '/boards' },
    { action: 'visit', target: '/board/:boardId', expect: { maxDurationMs: 156, status: 200 } },
  ]);
  expect(reproducing.replay.scenario.basis.pathSessions).toBe(40);
  expect(await svc.pollReplays('prod')).toEqual({ env: 'prod', polled: 1, settled: 0 });
  expect((await svc.get('prod', 1)).replay.state).toBe('running');
  expect(await svc.pollReplays('prod')).toEqual({ env: 'prod', polled: 1, settled: 1 });
  const confirmed = await svc.get('prod', 1);
  expect(confirmed.status).toBe('confirmed');
  expect(confirmed.replay.evidence).toMatchObject({ runner: 'fake-figura' });
  expect(c.adapters.issues.impl.issues.get('FAKE-1').reproduction.state).toBe('reproduced');
});

test('replay guards: prod target, bad transition, unknown incident', async () => {
  const { c, svc } = await setup();
  await ingest(c, 'prod', slowRouteData());
  await svc.runDetection('prod');
  await expect(svc.requestReplay('prod', 1, 'prod', operator)).rejects.toThrow(
    'figura_target_forbidden',
  );
  await expect(svc.requestReplay('prod', 99, 'dev', operator)).rejects.toMatchObject({
    statusCode: 404,
  });
  await svc.resolve('prod', 1, operator);
  await expect(svc.requestReplay('prod', 1, 'dev', operator)).rejects.toThrow('invalid_transition');
  await expect(svc.resolve('prod', 1, operator)).rejects.toThrow('invalid_transition');
  await expect(svc.get('staging', 1)).rejects.toThrow('invalid_env');
});

test('a failed run returns to the previous status; unchanged or failing polls are harmless', async () => {
  const { c, svc } = await setup();
  const fake = createFakeFigura({ decide: () => 'failed' });
  c.adapters.figura = createFiguraClient({ dev: fake, recette: fake });
  await ingest(c, 'prod', slowRouteData());
  await svc.runDetection('prod');
  await svc.requestReplay('prod', 1, 'dev', operator);
  await svc.pollReplays('prod');
  expect(await svc.pollReplays('prod')).toMatchObject({ settled: 1 });
  expect((await svc.get('prod', 1)).status).toBe('open');
  await svc.requestReplay('prod', 1, 'dev', operator);
  fake.runs.get('fake-2').polls = 5;
  const running = vi.spyOn(fake, 'status').mockResolvedValue({ state: 'queued' });
  expect(await svc.pollReplays('prod')).toMatchObject({ polled: 1, settled: 0 });
  running.mockRejectedValue(Object.assign(new Error('x'), { code: 'upstream_timeout' }));
  expect(await svc.pollReplays('prod')).toMatchObject({ polled: 1, settled: 0 });
  expect((await svc.get('prod', 1)).replay.state).toBe('queued');
});

test('auto replay rule sends new incidents to the configured target', async () => {
  const { c, svc } = await setup({ VIGIE_AUTO_REPLAY_TARGET: 'recette' });
  await ingest(c, 'prod', slowRouteData());
  await svc.runDetection('prod');
  const incident = await svc.get('prod', 1);
  expect(incident.status).toBe('reproducing');
  expect(incident.replay.requestedBy).toBe('vigie:auto');
  const again = await svc.runDetection('prod');
  expect(again.incidents[0].change).toBe('updated');
  expect((await svc.get('prod', 1)).replay.runId).toBe(incident.replay.runId);
});

test('without an issue sink or Figura (production, unconfigured) detection still works', async () => {
  const sink = logSink();
  const clock = fixedClock(NOW.toISOString());
  const c = noFixtures(
    await testContainer({
      clock,
      vars: { VIGIE_MODE: 'production', VIGIE_AUTO_REPLAY_TARGET: 'dev', VIGIE_LOG_LEVEL: 'warn' },
      logStream: sink.stream,
    }),
  );
  await ingest(c, 'prod', slowRouteData());
  await c.services.incidents.runDetection('prod');
  const incident = await c.services.incidents.get('prod', 1);
  expect(incident).toMatchObject({ status: 'open', issueRef: null });
  expect(sink.text()).toContain('auto replay failed');
});

test('a failing issue sink is logged and does not break detection', async () => {
  const sink = logSink();
  const clock = fixedClock(NOW.toISOString());
  const c = noFixtures(
    await testContainer({ clock, vars: { VIGIE_LOG_LEVEL: 'warn' }, logStream: sink.stream }),
  );
  c.adapters.issues.impl.open = async () => {
    throw Object.assign(new Error('down'), { code: 'upstream_unreachable' });
  };
  await ingest(c, 'prod', slowRouteData());
  await c.services.incidents.runDetection('prod');
  expect((await c.services.incidents.get('prod', 1)).issueRef).toBeNull();
  expect(sink.text()).toContain('issue sink failed');
  expect(sink.text()).not.toContain('down');
});

test('pull sources add signals and evidence; failing sources are reported, not fatal', async () => {
  const { c, svc } = await setup();
  const route = '/api/boards/:boardId';
  const point = (m, v) => ({ route, ts: ago(m), valueMs: v });
  c.adapters.sources.prod.metrics.impl = {
    latency: async ({ from }) =>
      from.toISOString() === ago(60)
        ? [point(5, 900), point(6, 950), point(7, 1000)]
        : [point(90, 100), point(95, 110), point(99, 90)],
  };
  c.adapters.sources.prod.errors.impl = {
    issues: async () => {
      throw new Error('no code');
    },
  };
  c.adapters.sources.prod.logs.impl = {
    query: async () => [
      { status: 500, msgKind: 'b' },
      { status: 200, msgKind: 'a' },
    ],
  };
  await ingest(c, 'prod', apiEvents({ route, count: 1, durationMs: 100, minutesAgo: 10 }));
  const result = await svc.runDetection('prod');
  expect(result.sourceErrors).toEqual({ errors: 'source_failed' });
  const incident = await svc.get('prod', 1);
  expect(incident.triggers.map((t) => [t.kind, t.source])).toEqual([
    ['latency', 'metrics'],
    ['log_evidence', 'logs'],
  ]);
  expect(incident.triggers[1].numbers).toEqual({ lines: 2, serverErrors: 1, msgKinds: ['a', 'b'] });
  c.adapters.sources.prod.metrics.impl.latency = async () => {
    throw Object.assign(new Error('x'), { code: 'not_implemented' });
  };
  c.adapters.sources.prod.errors.impl = null;
  c.adapters.sources.prod.errors = { impl: null };
  c.adapters.sources.prod.logs.impl.query = async () => {
    throw new Error('boom');
  };
  expect((await svc.runDetection('prod')).sourceErrors).toEqual({ metrics: 'not_implemented' });
});

test('logs failing with a code are recorded as evidence errors', async () => {
  const { c, svc } = await setup();
  c.adapters.sources.prod.logs.impl = {
    query: async () => {
      throw Object.assign(new Error('x'), { code: 'upstream_timeout' });
    },
  };
  await ingest(c, 'prod', slowRouteData());
  await svc.runDetection('prod');
  const incident = await svc.get('prod', 1);
  expect(incident.triggers.at(-1)).toMatchObject({
    kind: 'log_evidence',
    numbers: { error: 'upstream_timeout' },
  });
  c.adapters.sources.prod.logs.impl.query = async () => {
    throw new Error('no code');
  };
  await svc.runDetection('prod');
  expect((await svc.get('prod', 1)).triggers.at(-1).numbers).toEqual({ error: 'source_failed' });
});

test('rage clicks and funnel drops become incidents; funnel ones replay from the root page', async () => {
  const { c, svc } = await setup();
  const clicks = [];
  for (let s = 0; s < 6; s += 1) {
    const session = `rage_${String(s).padStart(8, '0')}`;
    for (let k = 0; k < 4; k += 1) {
      clicks.push(
        makeEvent({
          type: 'click',
          session,
          occurredAt: new Date(NOW.getTime() - 600000 + k * 1000).toISOString(),
          target: { page: '/board/:boardId', element: 'card.save' },
        }),
      );
    }
  }
  await ingest(c, 'prod', clicks);
  await c.repos.incidents.create('prod', {
    key: 'funnel:activation/signup_done',
    status: 'open',
    severity: 'high',
    title: 'Funnel drop at activation/signup_done',
    kinds: ['funnel_drop'],
    routes: [],
    pages: [],
    features: [],
    fingerprints: [],
    segments: { device: [], plan: [] },
    triggers: [{ kind: 'funnel_drop', numbers: {} }],
    firstSeen: NOW,
    lastSeen: NOW,
    history: [],
  });
  const result = await svc.runDetection('prod');
  expect(result.incidents).toEqual([
    { id: 2, key: 'element:/board/:boardId#card.save', change: 'opened' },
  ]);
  const funnel = await svc.requestReplay('prod', 1, 'dev', operator);
  expect(funnel.replay.scenario.steps).toEqual([
    { action: 'visit', target: '/', expect: { status: 200 } },
  ]);
});
