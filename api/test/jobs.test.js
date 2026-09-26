import { EventEmitter } from 'node:events';
import { afterAll, expect, test, vi } from 'vitest';
import { compareRoute, knownRoutes, rollup } from '../src/jobs/rollup.js';
import { startJobs } from '../src/jobs/runner.js';
import { createScheduler } from '../src/jobs/scheduler.js';
import { createTasks } from '../src/jobs/tasks.js';
import { NOW, apiEvents, ingest } from './factories.js';
import { fixedClock, logSink, makeEvent, testContainer, testDb, testVars } from './helpers.js';

afterAll(async () => (await testDb()).close());

function manualTimers() {
  const pending = [];
  return {
    pending,
    setTimeout: (fn, ms) => {
      const handle = { fn, ms };
      pending.push(handle);
      return handle;
    },
    clearTimeout: (handle) => {
      pending.splice(pending.indexOf(handle), 1);
    },
    async fire() {
      const handle = pending.shift();
      await handle.fn();
    },
  };
}

test('the scheduler uses injected timers, reschedules after each run and survives failures', async () => {
  const timers = manualTimers();
  const log = { error: vi.fn() };
  const scheduler = createScheduler({
    setTimer: timers.setTimeout,
    clearTimer: timers.clearTimeout,
    log,
  });
  const run = vi
    .fn()
    .mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'boom' }))
    .mockRejectedValueOnce(new Error('y'))
    .mockResolvedValue();
  scheduler.schedule('job', 1000, run);
  expect(timers.pending.map((p) => p.ms)).toEqual([1000]);
  await timers.fire();
  await timers.fire();
  await timers.fire();
  expect(run).toHaveBeenCalledTimes(3);
  expect(log.error.mock.calls.map((c) => c[0])).toEqual([
    { job: 'job', code: 'boom' },
    { job: 'job', code: 'job_failed' },
  ]);
  expect(timers.pending).toHaveLength(1);
  const last = timers.pending[0];
  scheduler.stop();
  expect(timers.pending).toHaveLength(0);
  await last.fn();
  expect(timers.pending).toHaveLength(0);
});

test('rollups are per environment, idempotent, and comparisons stay side by side', async () => {
  const c = await testContainer({ clock: fixedClock(NOW.toISOString()) });
  const route = '/api/boards/:boardId';
  await ingest(c, 'prod', [
    ...apiEvents({ route, count: 10, durationMs: (i) => 100 * (i + 1), minutesAgo: 30 }),
    makeEvent({
      type: 'server_error',
      occurredAt: '2026-09-01T11:00:00Z',
      perf: { route, status: 500 },
    }),
    makeEvent({ type: 'feature_use', occurredAt: '2026-09-01T11:00:00Z', perf: {} }),
    makeEvent({
      type: 'feature_use',
      consent: 'essential',
      occurredAt: '2026-09-01T11:00:00Z',
      perf: {},
    }),
  ]);
  await ingest(
    c,
    'recette',
    apiEvents({ env: 'recette', route, count: 4, durationMs: 50, minutesAgo: 30 }),
  );
  expect(await rollup(c.db, 'prod', '2026-09-01', '2026-09-01')).toEqual({
    routes: 1,
    features: 1,
  });
  expect(await rollup(c.db, 'prod', '2026-09-01', '2026-09-01')).toEqual({
    routes: 1,
    features: 1,
  });
  await rollup(c.db, 'recette', '2026-09-01', '2026-09-01');
  const series = await compareRoute(c.db, ['prod', 'recette'], route, '2026-08-01');
  expect(series.prod).toEqual([
    { day: '2026-09-01', requests: 11, errors: 1, p50_ms: 550, p95_ms: expect.closeTo(955, 5) },
  ]);
  expect(series.recette).toEqual([
    { day: '2026-09-01', requests: 4, errors: 0, p50_ms: 50, p95_ms: 50 },
  ]);
  expect(await knownRoutes(c.db, 'prod')).toEqual(['/api/boards/:boardId']);
  const usage = await c.db.query('SELECT feature, users, uses FROM daily_feature_usage');
  expect(usage.rows).toEqual([{ feature: 'card.create', users: 1, uses: 1 }]);
  await expect(rollup(c.db, 'all', '2026-09-01', '2026-09-01')).rejects.toThrow('invalid_env');
  await expect(compareRoute(c.db, ['prod', 'x'], route, '2026-08-01')).rejects.toThrow(
    'invalid_env',
  );
  await expect(knownRoutes(c.db, undefined)).rejects.toThrow('invalid_env');
});

test('retention rolls up, deletes raw events past the retention, and purges used SSO ids', async () => {
  const clock = fixedClock(NOW.toISOString());
  const c = await testContainer({ clock, vars: { VIGIE_RAW_RETENTION_DAYS: '10' } });
  await ingest(c, 'prod', [
    makeEvent({ occurredAt: '2026-08-30T10:00:00Z' }),
    makeEvent({ occurredAt: '2026-09-01T10:00:00Z' }),
  ]);
  await c.repos.jti.consume('old', new Date('2026-08-01T00:00:00Z'));
  const tasks = createTasks({
    incidents: c.services.incidents,
    rollupFn: rollup,
    eventsRepo: c.repos.events,
    jtiRepo: c.repos.jti,
    db: c.db,
    config: c.config,
    clock,
    log: c.log,
  });
  const result = await tasks.retention();
  expect(result).toEqual({
    cutoff: '2026-08-22T12:00:00.000Z',
    results: [
      { env: 'dev', deleted: 0 },
      { env: 'recette', deleted: 0 },
      { env: 'prod', deleted: 0 },
    ],
    jti: 1,
  });
  clock.advance(8 * 86400000);
  expect((await tasks.retention()).results[2]).toEqual({ env: 'prod', deleted: 1 });
  expect((await tasks.detect()).map((r) => r.env)).toEqual(['dev', 'recette', 'prod']);
  expect((await tasks.pollReplays()).map((r) => r.polled)).toEqual([0, 0, 0]);
  const daily = await c.db.query('SELECT count(*) AS n FROM daily_feature_usage');
  expect(daily.rows[0].n).toBe(1);
});

test('the jobs process schedules detection, polling and retention, and stops on SIGTERM', async () => {
  const timers = manualTimers();
  const signals = new EventEmitter();
  const sink = logSink();
  const jobs = await startJobs(testVars({ VIGIE_DETECT_INTERVAL_SECONDS: '60' }), {
    signals,
    timers,
    logStream: sink.stream,
  });
  expect(timers.pending.map((p) => p.ms)).toEqual([60000, 30000, 3600000]);
  expect([...jobs.scheduler.timers.keys()]).toEqual(['detect', 'poll-replays', 'retention']);
  await timers.fire();
  expect(timers.pending).toHaveLength(3);
  signals.emit('SIGTERM');
  await vi.waitFor(() => expect(timers.pending).toHaveLength(0));
});
