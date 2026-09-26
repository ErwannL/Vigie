import { afterAll, expect, test } from 'vitest';
import { issueSession } from '../src/auth/session.js';
import { rollup } from '../src/jobs/rollup.js';
import { ingest, slowRouteData } from './factories.js';
import { login, testApp } from './http-helpers.js';
import { SECRETS, makeEvent, testDb } from './helpers.js';

afterAll(async () => (await testDb()).close());

const OPERATOR_ROUTES = [
  ['GET', '/v1/session'],
  ['GET', '/v1/catalogues'],
  ['GET', '/v1/settings'],
  ['GET', '/v1/routes?env=prod'],
  ['GET', '/v1/compare/latency?envs=prod,recette&route=/x'],
  ['GET', '/v1/incidents?env=prod'],
  ['GET', '/v1/incidents/1?env=prod'],
  ['POST', '/v1/incidents/1/replay?env=prod'],
  ['POST', '/v1/incidents/1/resolve?env=prod'],
  ['POST', '/v1/detect?env=prod'],
  ['GET', '/v1/insights/usage?env=prod'],
  ['GET', '/v1/insights/landing?env=prod'],
  ['GET', '/v1/insights/funnels?env=prod'],
  ['GET', '/v1/insights/segments?env=prod'],
  ['GET', '/v1/insights/errors?env=prod'],
  ['POST', '/v1/personas/preview'],
  ['POST', '/v1/personas/push'],
  ['GET', '/v1/personas?env=prod'],
];

test("every operator route requires Vigie's session (an ingestion secret is not enough)", async () => {
  const { app, clock } = await testApp();
  const expired = issueSession(
    { sub: 'op', name: null },
    SECRETS.session,
    new Date('2020-01-01'),
    60,
  ).token;
  for (const [method, url] of OPERATOR_ROUTES) {
    for (const headers of [
      {},
      { authorization: `Bearer ${SECRETS.prod}` },
      { authorization: `Bearer ${expired}` },
    ]) {
      const res = await app.inject({ method, url, headers });
      expect([url, res.statusCode, res.json()]).toEqual([url, 401, { error: 'unauthorized' }]);
    }
  }
  const headers = await login(app, clock);
  expect((await app.inject({ url: '/v1/session', headers })).json()).toEqual({
    operator: { sub: 'op-1', name: 'Ada Lovelace' },
  });
});

test('catalogues and settings (source status, retention, versions, ingestion configured)', async () => {
  const { app, clock } = await testApp({
    vars: { VIGIE_INGEST_SECRET_DEV: '', VIGIE_LOKI_URL_PROD: 'http://loki' },
  });
  const headers = await login(app, clock);
  const cat = (await app.inject({ url: '/v1/catalogues', headers })).json();
  expect(cat.features.items).toContain('card.move');
  const settings = (await app.inject({ url: '/v1/settings', headers })).json();
  expect(settings).toMatchObject({
    mode: 'development',
    envs: ['dev', 'recette', 'prod'],
    figuraTargets: ['dev', 'recette'],
    rawRetentionDays: 60,
    kAnonymity: 10,
    ingestion: { dev: false, recette: true, prod: true },
    catalogues: { eventSchema: 1, features: 1, funnels: 1, segments: 1 },
  });
  expect(settings.adapters.sources.prod).toEqual({
    logs: 'configured',
    metrics: 'fake',
    errors: 'fake',
  });
});

test('env is a required parameter of every read', async () => {
  const { app, clock } = await testApp();
  const headers = await login(app, clock);
  for (const url of [
    '/v1/incidents',
    '/v1/incidents/1',
    '/v1/routes',
    '/v1/insights/usage',
    '/v1/personas',
    '/v1/insights/errors?env=all',
  ]) {
    expect((await app.inject({ url, headers })).json()).toEqual({ error: 'invalid_env' });
  }
  expect((await app.inject({ method: 'POST', url: '/v1/detect', headers })).json()).toEqual({
    error: 'invalid_env',
  });
});

test('incident workflow over HTTP: detect, list, detail, replay in recette, resolve', async () => {
  const { app, container, clock } = await testApp();
  for (const kind of ['logs', 'metrics', 'errors'])
    container.adapters.sources.prod[kind] = { impl: null };
  await ingest(container, 'prod', slowRouteData());
  const headers = await login(app, clock);
  const detect = await app.inject({ method: 'POST', url: '/v1/detect?env=prod', headers });
  expect(detect.json().incidents).toHaveLength(1);
  const list = (await app.inject({ url: '/v1/incidents?env=prod&status=open', headers })).json();
  expect(list.incidents.map((i) => i.id)).toEqual([1]);
  expect(
    (await app.inject({ url: '/v1/incidents?env=recette', headers })).json().incidents,
  ).toEqual([]);
  expect(
    (await app.inject({ url: '/v1/incidents?env=prod&status=weird', headers })).json(),
  ).toEqual({ error: 'invalid_status' });
  expect((await app.inject({ url: '/v1/incidents/1?env=recette', headers })).statusCode).toBe(404);
  expect((await app.inject({ url: '/v1/incidents/1x?env=prod', headers })).json()).toEqual({
    error: 'invalid_incident_id',
  });
  expect((await app.inject({ url: '/v1/incidents/0?env=prod', headers })).json()).toEqual({
    error: 'invalid_incident_id',
  });
  const forbidden = await app.inject({
    method: 'POST',
    url: '/v1/incidents/1/replay?env=prod',
    headers,
    payload: { targetEnv: 'prod' },
  });
  expect([forbidden.statusCode, forbidden.json()]).toEqual([
    400,
    { error: 'figura_target_forbidden' },
  ]);
  expect(
    (await app.inject({ method: 'POST', url: '/v1/incidents/1/replay?env=prod', headers })).json(),
  ).toEqual({
    error: 'figura_target_forbidden',
  });
  const replay = await app.inject({
    method: 'POST',
    url: '/v1/incidents/1/replay?env=prod',
    headers,
    payload: { targetEnv: 'recette' },
  });
  expect(replay.json().incident).toMatchObject({
    status: 'reproducing',
    replay: { targetEnv: 'recette', sourceEnv: 'prod' },
  });
  const conflict = await app.inject({
    method: 'POST',
    url: '/v1/incidents/1/resolve?env=prod',
    headers,
  });
  expect([conflict.statusCode, conflict.json()]).toEqual([409, { error: 'invalid_transition' }]);
  await container.services.incidents.pollReplays('prod');
  await container.services.incidents.pollReplays('prod');
  const resolved = await app.inject({
    method: 'POST',
    url: '/v1/incidents/1/resolve?env=prod',
    headers,
  });
  expect(resolved.json().incident.status).toBe('resolved');
  const detail = (await app.inject({ url: '/v1/incidents/1?env=prod', headers })).json().incident;
  expect(detail.history.map((h) => h.event)).toEqual([
    'opened',
    'reproducing',
    'replay_reproduced',
    'resolved',
  ]);
});

test('insights and personas over HTTP', async () => {
  const { app, container, clock } = await testApp();
  await ingest(container, 'prod', [makeEvent()]);
  const headers = await login(app, clock);
  const usage = (await app.inject({ url: '/v1/insights/usage?env=prod&days=7', headers })).json();
  expect(usage).toMatchObject({ env: 'prod', analytics: { hasData: true }, window: { days: 7 } });
  expect(usage.features.find((f) => f.feature === 'card.create').users).toEqual({
    value: null,
    masked: true,
  });
  expect(
    (await app.inject({ url: '/v1/insights/landing?env=prod', headers })).json().visitors.masked,
  ).toBe(true);
  expect(
    (await app.inject({ url: '/v1/insights/funnels?env=prod&by=plan', headers })).json().by,
  ).toBe('plan');
  expect(
    (await app.inject({ url: '/v1/insights/segments?env=prod', headers })).json().accounts.masked,
  ).toBe(true);
  expect(
    (await app.inject({ url: '/v1/insights/errors?env=dev', headers })).json().analytics.hasData,
  ).toBe(false);
  const preview = await app.inject({
    method: 'POST',
    url: '/v1/personas/preview',
    headers,
    payload: { sourceEnv: 'prod', targetEnv: 'recette' },
  });
  expect(preview.json().set.personas).toEqual([]);
  const push = await app.inject({
    method: 'POST',
    url: '/v1/personas/push',
    headers,
    payload: { sourceEnv: 'prod', targetEnv: 'prod' },
  });
  expect(push.json()).toEqual({ error: 'figura_target_forbidden' });
  expect(
    (await app.inject({ method: 'POST', url: '/v1/personas/preview', headers })).json(),
  ).toEqual({ error: 'figura_target_forbidden' });
  expect((await app.inject({ url: '/v1/personas?env=prod', headers })).json()).toEqual({
    env: 'prod',
    sets: [],
  });
});

test('environment comparison is explicit and side by side', async () => {
  const { app, container, clock } = await testApp();
  await ingest(container, 'prod', slowRouteData());
  await ingest(container, 'recette', slowRouteData({ env: 'recette' }));
  for (const env of ['prod', 'recette'])
    await rollup(container.db, env, '2026-08-20', '2026-09-01');
  const headers = await login(app, clock);
  const route = encodeURIComponent('/api/boards/:boardId');
  const res = (
    await app.inject({
      url: `/v1/compare/latency?envs=prod,recette&route=${route}&days=30`,
      headers,
    })
  ).json();
  expect(res.route).toBe('/api/boards/:boardId');
  expect(res.days).toBe(30);
  expect(Object.keys(res.series)).toEqual(['prod', 'recette']);
  expect(res.series.prod.length).toBeGreaterThan(1);
  expect(
    (await app.inject({ url: `/v1/compare/latency?envs=prod&route=${route}`, headers })).json(),
  ).toEqual({
    error: 'compare_needs_distinct_envs',
  });
  expect(
    (await app.inject({ url: `/v1/compare/latency?envs=prod,prod&route=${route}`, headers })).json()
      .error,
  ).toBe('compare_needs_distinct_envs');
  expect(
    (await app.inject({ url: '/v1/compare/latency?envs=prod,recette', headers })).json(),
  ).toEqual({ error: 'invalid_route' });
  expect((await app.inject({ url: '/v1/compare/latency?route=/x', headers })).json()).toEqual({
    error: 'invalid_env',
  });
  const defaults = (
    await app.inject({ url: `/v1/compare/latency?envs=prod,recette&route=${route}`, headers })
  ).json();
  expect(defaults.days).toBe(14);
  expect((await app.inject({ url: '/v1/routes?env=prod', headers })).json()).toEqual({
    env: 'prod',
    routes: ['/api/boards/:boardId'],
  });
});
