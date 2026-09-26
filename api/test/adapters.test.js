import { expect, test, vi } from 'vitest';
import { createFakeErrorsSource } from '../src/adapters/errors/fake.js';
import { createFiguraClient } from '../src/adapters/figura/client.js';
import { createFakeFigura } from '../src/adapters/figura/fake.js';
import { fetchJson } from '../src/adapters/http.js';
import { createFakeIssueSink } from '../src/adapters/issues/fake.js';
import { createFakeLogsSource } from '../src/adapters/logs/fake.js';
import { createFakeMetricsSource } from '../src/adapters/metrics/fake.js';
import { adapterStatus, createAdapters } from '../src/adapters/registry.js';
import { loadConfig } from '../src/config.js';
import { fixedClock } from './helpers.js';

const clock = fixedClock('2026-09-01T12:00:00Z');
const at = (iso) => new Date(iso);
const window = { from: at('2026-09-01T11:00:00Z'), to: at('2026-09-01T12:00:00Z') };

test('fetchJson sends JSON with a timeout signal and returns the body', async () => {
  const fetchImpl = vi.fn(async () => ({ ok: true, text: async () => '{"a":1}' }));
  const body = await fetchJson('http://x/y', {
    method: 'POST',
    body: { q: 1 },
    timeoutMs: 50,
    fetchImpl,
  });
  expect(body).toEqual({ a: 1 });
  const [url, init] = fetchImpl.mock.calls[0];
  expect(url).toBe('http://x/y');
  expect(init.body).toBe('{"q":1}');
  expect(init.signal).toBeInstanceOf(AbortSignal);
  expect(init.headers.accept).toBe('application/json');
  await fetchJson('http://x', { timeoutMs: 50, fetchImpl });
  expect(fetchImpl.mock.calls[1][1]).toMatchObject({ method: 'GET', body: undefined });
});

test('fetchJson maps timeouts, network failures and HTTP errors to codes', async () => {
  const timeout = Object.assign(new Error('t'), { name: 'TimeoutError' });
  const fail = (err) => async () => {
    throw err;
  };
  await expect(fetchJson('u', { timeoutMs: 1, fetchImpl: fail(timeout) })).rejects.toThrow(
    'upstream_timeout',
  );
  await expect(fetchJson('u', { timeoutMs: 1, fetchImpl: fail(new Error('x')) })).rejects.toThrow(
    'upstream_unreachable',
  );
  await expect(
    fetchJson('u', { timeoutMs: 1, fetchImpl: async () => ({ ok: false, status: 503 }) }),
  ).rejects.toMatchObject({ code: 'upstream_error', details: { status: 503 } });
});

test('fetchJson really aborts a slow server', async () => {
  const slow = (_url, { signal }) =>
    new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason)),
    );
  await expect(fetchJson('u', { timeoutMs: 20, fetchImpl: slow })).rejects.toThrow(
    'upstream_timeout',
  );
});

test('fake logs source filters by window, route and level', async () => {
  const logs = createFakeLogsSource(
    [
      { offsetMinutes: 5, level: 'error', route: '/a', durationMs: 1, status: 500, msgKind: 'k' },
      { offsetMinutes: 10, level: 'info', route: '/b', durationMs: 1, status: 200, msgKind: 'k' },
      { offsetMinutes: 120, level: 'info', route: '/a', durationMs: 1, status: 200, msgKind: 'k' },
    ],
    clock,
  );
  expect(await logs.query(window)).toHaveLength(2);
  expect(await logs.query({ ...window, route: '/a' })).toEqual([
    {
      ts: '2026-09-01T11:55:00.000Z',
      level: 'error',
      route: '/a',
      durationMs: 1,
      status: 500,
      msgKind: 'k',
    },
  ]);
  expect(await logs.query({ ...window, level: 'info' })).toHaveLength(1);
});

test('fake metrics source returns points in the window', async () => {
  const metrics = createFakeMetricsSource(
    [
      {
        route: '/a',
        points: [
          { offsetMinutes: 1, valueMs: 10 },
          { offsetMinutes: 90, valueMs: 20 },
        ],
      },
      { route: '/b', points: [{ offsetMinutes: 2, valueMs: 30 }] },
    ],
    clock,
  );
  expect(await metrics.latency({ ...window, quantile: 0.95 })).toHaveLength(2);
  expect(await metrics.latency({ ...window, route: '/a', quantile: 0.95 })).toEqual([
    { route: '/a', ts: '2026-09-01T11:59:00.000Z', valueMs: 10 },
  ]);
});

test('fake errors source counts occurrences in the window', async () => {
  const errors = createFakeErrorsSource(
    [
      { fingerprint: 'A', title: 'a', route: '/r', occurrences: [1, 30, 500] },
      { fingerprint: 'B', title: 'b', occurrences: [2] },
      { fingerprint: 'C', title: 'c', occurrences: [300] },
    ],
    clock,
  );
  expect(await errors.issues(window)).toEqual([
    {
      fingerprint: 'A',
      title: 'a',
      count: 2,
      firstSeen: '2026-09-01T11:30:00.000Z',
      lastSeen: '2026-09-01T11:59:00.000Z',
      route: '/r',
    },
    {
      fingerprint: 'B',
      title: 'b',
      count: 1,
      firstSeen: '2026-09-01T11:58:00.000Z',
      lastSeen: '2026-09-01T11:58:00.000Z',
      route: null,
    },
  ]);
});

const scenario = (targetEnv) => ({ targetEnv, steps: [{ action: 'visit', target: '/' }] });

test('Figura never runs against prod: replay, status and personas refuse it before any call', async () => {
  const impl = { replay: vi.fn(), status: vi.fn(), pushPersonas: vi.fn() };
  // Even if someone wired an implementation under "prod", the client refuses it.
  const client = createFiguraClient({ dev: impl, recette: impl, prod: impl });
  await expect(client.replay(scenario('prod'))).rejects.toThrow('figura_target_forbidden');
  await expect(client.status('prod:run-1')).rejects.toThrow('figura_target_forbidden');
  await expect(client.pushPersonas({ targetEnv: 'prod', personas: [] })).rejects.toThrow(
    'figura_target_forbidden',
  );
  await expect(client.replay(scenario(undefined))).rejects.toThrow('figura_target_forbidden');
  expect(impl.replay).not.toHaveBeenCalled();
  expect(impl.status).not.toHaveBeenCalled();
  expect(impl.pushPersonas).not.toHaveBeenCalled();
});

test('Figura client routes run ids to their target and reports missing targets', async () => {
  const clock = fixedClock('2026-09-01T12:00:00Z');
  const fake = createFakeFigura({ clock, decide: () => 'not_reproduced' });
  const client = createFiguraClient({ dev: null, recette: fake });
  const { runId } = await client.replay(scenario('recette'));
  expect(runId).toBe(`recette:fake.not_reproduced.${clock.now().getTime()}.1`);
  expect(await client.status(runId)).toEqual({ state: 'running', evidence: null });
  clock.advance(19999);
  expect((await client.status(runId)).state).toBe('running');
  clock.advance(1);
  expect(await client.status(runId)).toEqual({
    state: 'not_reproduced',
    evidence: { runner: 'fake-figura', steps: 1, links: [] },
  });
  expect(await client.status('recette:unknown')).toEqual({
    state: 'failed',
    evidence: { reason: 'unknown_run' },
  });
  await expect(client.replay(scenario('dev'))).rejects.toMatchObject({
    code: 'figura_not_configured',
    statusCode: 503,
  });
  expect(await client.pushPersonas({ targetEnv: 'recette', personas: [{}, {}] })).toEqual({
    accepted: 2,
  });
  expect(fake.personaSets).toHaveLength(1);
});

test('the fake Figura is stateless: another process (another instance) can poll the run', async () => {
  const clock = fixedClock('2026-09-01T12:00:00Z');
  const api = createFakeFigura({ clock });
  const jobs = createFakeFigura({ clock, runningMs: 0 });
  const { runId } = await api.replay(scenario('dev'));
  expect(await jobs.status(runId)).toMatchObject({ state: 'reproduced' });
});

test('fake issue sink derives refs from the incident, so processes agree', async () => {
  const sink = createFakeIssueSink();
  const { ref } = await sink.open({ env: 'prod', incidentId: 7, title: 'a' });
  expect(ref).toBe('FAKE-prod-7');
  await sink.update(ref, { title: 'b' });
  expect(sink.issues.get(ref)).toEqual({ title: 'b' });
  expect((await createFakeIssueSink().open({ env: 'prod', incidentId: 7 })).ref).toBe(ref);
});

test('registry: configured → real, missing in development → fake, missing otherwise → disabled', () => {
  const dev = createAdapters(
    loadConfig({
      VIGIE_MODE: 'development',
      VIGIE_LOKI_URL_PROD: 'http://loki',
      VIGIE_FIGURA_URL_RECETTE: 'http://f',
      VIGIE_FIGURA_TOKEN_RECETTE: 'f'.repeat(32),
      VIGIE_FIGURA_URL_DEV: 'http://f-dev',
    }),
    { clock, fixtures: { prod: { logs: [], metrics: [], errors: [] } } },
  );
  expect(adapterStatus(dev)).toEqual({
    sources: {
      dev: { logs: 'fake', metrics: 'fake', errors: 'fake' },
      recette: { logs: 'fake', metrics: 'fake', errors: 'fake' },
      prod: { logs: 'configured', metrics: 'fake', errors: 'fake' },
    },
    figura: { dev: 'fake', recette: 'configured' },
    issues: 'fake',
  });
  const prodMode = createAdapters(
    loadConfig({
      VIGIE_ERRORS_URL_DEV: 'http://gt',
      VIGIE_ERRORS_PROJECT_DEV: 'org/proj',
      VIGIE_PROMETHEUS_URL_DEV: 'http://p',
      VIGIE_ISSUES_URL: 'http://o',
    }),
    { clock },
  );
  expect(adapterStatus(prodMode)).toEqual({
    sources: {
      dev: { logs: 'not_configured', metrics: 'configured', errors: 'configured' },
      recette: { logs: 'not_configured', metrics: 'not_configured', errors: 'not_configured' },
      prod: { logs: 'not_configured', metrics: 'not_configured', errors: 'not_configured' },
    },
    figura: { dev: 'not_configured', recette: 'not_configured' },
    issues: 'configured',
  });
  expect(prodMode.sources.prod.logs.impl).toBeNull();
  expect(Object.keys(prodMode.figuraSlots)).toEqual(['dev', 'recette']);
});
