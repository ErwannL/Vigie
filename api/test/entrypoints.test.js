import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import { afterAll, expect, test, vi } from 'vitest';
import { loadConfig } from '../src/config.js';
import { FIXTURES_DIR, loadFixtures, systemClock } from '../src/container.js';
import { runSeed, seedScale } from '../src/seed/cli.js';
import { runMigrations } from '../src/store/migrate-cli.js';
import { startApi } from '../src/server.js';
import { logSink, testDb, testVars } from './helpers.js';

afterAll(async () => (await testDb()).close());

test('the API listens, answers and stops on SIGTERM', async () => {
  const signals = new EventEmitter();
  const sink = logSink();
  const api = await startApi(
    testVars({ VIGIE_PORT: '0', VIGIE_HOST: '127.0.0.1', VIGIE_LOG_LEVEL: 'info' }),
    {
      signals,
      logStream: sink.stream,
    },
  );
  const { port } = api.app.server.address();
  const res = await fetch(`http://127.0.0.1:${port}/healthz`);
  expect(await res.json()).toEqual({ status: 'ok' });
  signals.emit('SIGTERM');
  await vi.waitFor(() => expect(api.app.server.listening).toBe(false));
  expect(sink.text()).toContain('Server listening');
});

test('entry modules start with process.env', async () => {
  Object.assign(
    process.env,
    testVars({ VIGIE_PORT: '0', VIGIE_HOST: '127.0.0.1', VIGIE_SEED_SCALE: '0.02' }),
  );
  const before = process.listenerCount('SIGTERM');
  const api = await (await import('../src/main.js')).running;
  const jobs = await (await import('../src/jobs/main.js')).running;
  expect(api.app.server.listening).toBe(true);
  expect(jobs.scheduler.timers.size).toBe(3);
  await api.stop();
  await jobs.stop();
  for (const name of ['SIGTERM', 'SIGINT']) {
    for (const listener of process.listeners(name).slice(before))
      process.removeListener(name, listener);
  }
  expect(await (await import('../src/store/migrate-cli.js')).running).toEqual(expect.any(Array));
  const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  const summary = await (await import('../src/seed/cli.js')).running;
  write.mockRestore();
  expect(summary.prod.accepted).toBeGreaterThan(0);
}, 60000);

test('seed CLI: scale parsing and summary output', async () => {
  expect(seedScale({})).toBe(1);
  expect(seedScale({ VIGIE_SEED_SCALE: '-1' })).toBe(1);
  expect(seedScale({ VIGIE_SEED_SCALE: '0.5' })).toBe(0.5);
  let text = '';
  const out = new Writable({
    write(chunk, _e, done) {
      text += chunk;
      done();
    },
  });
  const summary = await runSeed(testVars({ VIGIE_SEED_SCALE: '0.02' }), { out });
  expect(JSON.parse(text)).toEqual(summary);
  expect(await runMigrations(testVars())).toEqual([]);
});

test('fixtures only load in development; the system clock is real time', () => {
  expect(loadFixtures(loadConfig({}))).toEqual({});
  expect(
    Object.keys(loadFixtures(loadConfig({ VIGIE_MODE: 'development' }), FIXTURES_DIR)),
  ).toEqual(['dev', 'recette', 'prod']);
  expect(Math.abs(systemClock.now() - Date.now())).toBeLessThan(1000);
});
