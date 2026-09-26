import { expect, test, vi } from 'vitest';
import {
  createGlitchtipErrorsSource,
  mapIssue,
  parseProject,
} from '../src/adapters/errors/glitchtip.js';
import { createFiguraClient } from '../src/adapters/figura/client.js';
import { createHttpFigura } from '../src/adapters/figura/figura.js';
import { bearer, fetchJson, joinUrl, quoteString } from '../src/adapters/http.js';
import { createOrqeaIssueSink } from '../src/adapters/issues/orqea.js';
import { createLokiLogsSource, lokiQuery, mapLokiLine } from '../src/adapters/logs/loki.js';
import { createPrometheusMetricsSource, latencyQuery } from '../src/adapters/metrics/prometheus.js';
import { createAdapters } from '../src/adapters/registry.js';
import { loadConfig } from '../src/config.js';
import { fixedClock } from './helpers.js';

const from = new Date('2026-09-01T11:00:00Z');
const to = new Date('2026-09-01T12:00:00Z');

/** A fake fetch answering `body` (object → JSON, string → raw) and recording the calls. */
function fakeFetch(body, { ok = true, status = 200 } = {}) {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return vi.fn(async () => ({ ok, status, text: async () => text }));
}
const call = (fetchImpl, i = 0) => {
  const [url, init] = fetchImpl.mock.calls[i];
  return { url: new URL(url), raw: url, init, body: init.body && JSON.parse(init.body) };
};

// --- http.js -------------------------------------------------------------------------------

test('fetchJson: empty body → null, non-JSON → upstream_bad_response, JSON body sets content-type', async () => {
  expect(await fetchJson('u', { timeoutMs: 5, fetchImpl: fakeFetch('') })).toBeNull();
  await expect(fetchJson('u', { timeoutMs: 5, fetchImpl: fakeFetch('<html>') })).rejects.toThrow(
    'upstream_bad_response',
  );
  const f = fakeFetch({});
  await fetchJson('http://u', {
    method: 'POST',
    body: {},
    headers: { x: '1' },
    timeoutMs: 5,
    fetchImpl: f,
  });
  await fetchJson('http://u', { timeoutMs: 5, fetchImpl: f });
  expect(call(f, 0).init.headers).toEqual({
    accept: 'application/json',
    'content-type': 'application/json',
    x: '1',
  });
  expect(call(f, 1).init.headers).toEqual({ accept: 'application/json' });
});

test('http helpers: bearer, joinUrl, quoteString', () => {
  expect(bearer('abc')).toEqual({ authorization: 'Bearer abc' });
  expect(bearer(null)).toEqual({});
  expect(joinUrl('http://h/', '/p')).toBe('http://h/p');
  expect(joinUrl('http://h', '/p')).toBe('http://h/p');
  expect(quoteString('a"b\\c')).toBe('"a\\"b\\\\c"');
});

// --- Loki ----------------------------------------------------------------------------------

test('Loki query: selector, | json, escaped route and level filters', () => {
  const sel = '{container=~".*backend.*"}';
  expect(lokiQuery(sel, {})).toBe(`${sel} | json`);
  expect(lokiQuery(sel, { route: '/api/"x"', level: 'error' })).toBe(
    `${sel} | json | route="/api/\\"x\\"" | level="error"`,
  );
});

test('Loki: calls query_range in ns and maps JSON lines, never the message text', async () => {
  const ns = (iso) => `${BigInt(Date.parse(iso)) * 1000000n}`;
  const line = (o) => JSON.stringify(o);
  const fetchImpl = fakeFetch({
    status: 'success',
    data: {
      result: [
        {
          stream: { container: 'orqea-backend-1' },
          values: [
            [
              ns('2026-09-01T11:30:00Z'),
              line({
                level: 'warn',
                route: '/api/boards/:boardId',
                durationMs: 812,
                status: 200,
                msgKind: 'slow_query',
                msg: 'secret text',
              }),
            ],
            [
              ns('2026-09-01T11:10:00Z'),
              line({ level: 'error', duration_ms: 5, statusCode: 500, event: 'db_down' }),
            ],
            [ns('2026-09-01T11:20:00Z'), 'not json'],
            [ns('2026-09-01T11:21:00Z'), '[1,2]'],
            [ns('2026-09-01T11:22:00Z'), 'null'],
          ],
        },
        { stream: {} },
      ],
    },
  });
  const loki = createLokiLogsSource({ url: 'http://loki/', timeoutMs: 50, fetchImpl });
  const rows = await loki.query({ from, to, route: '/api/boards/:boardId' });
  const { url } = call(fetchImpl);
  expect(url.origin + url.pathname).toBe('http://loki/loki/api/v1/query_range');
  expect(Object.fromEntries(url.searchParams)).toEqual({
    query: '{container=~".*backend.*"} | json | route="/api/boards/:boardId"',
    start: '1788260400000000000',
    end: '1788264000000000000',
    limit: '5000',
    direction: 'forward',
  });
  expect(rows).toEqual([
    {
      ts: '2026-09-01T11:10:00.000Z',
      level: 'error',
      route: null,
      durationMs: 5,
      status: 500,
      msgKind: 'db_down',
    },
    {
      ts: '2026-09-01T11:30:00.000Z',
      level: 'warn',
      route: '/api/boards/:boardId',
      durationMs: 812,
      status: 200,
      msgKind: 'slow_query',
    },
  ]);
  expect(JSON.stringify(rows)).not.toContain('secret text');
});

test('Loki: missing fields become null, a custom selector is used, a bad response is refused', async () => {
  expect(mapLokiLine('0', JSON.stringify({ msg: 'hello', durationMs: 'x', level: 3 }))).toEqual({
    ts: '1970-01-01T00:00:00.000Z',
    level: null,
    route: null,
    durationMs: null,
    status: null,
    msgKind: null,
  });
  const f = fakeFetch({ data: { result: [] } });
  const loki = createLokiLogsSource({
    url: 'http://l',
    timeoutMs: 5,
    selector: '{app="x"}',
    fetchImpl: f,
  });
  expect(await loki.query({ from, to, level: 'error' })).toEqual([]);
  expect(call(f).url.searchParams.get('query')).toBe('{app="x"} | json | level="error"');
  const bad = createLokiLogsSource({ url: 'http://l', timeoutMs: 5, fetchImpl: fakeFetch({}) });
  await expect(bad.query({ from, to })).rejects.toThrow('upstream_bad_response');
});

// --- Prometheus ----------------------------------------------------------------------------

test('Prometheus query: histogram_quantile over the route template, route filter optional', () => {
  const m = 'orqea_http_request_duration_seconds_bucket';
  expect(latencyQuery(m, { quantile: 0.95 })).toBe(
    `histogram_quantile(0.95, sum by (le, route) (rate(${m}[5m])))`,
  );
  expect(latencyQuery(m, { quantile: 0.5, route: '/api/x' })).toBe(
    `histogram_quantile(0.5, sum by (le, route) (rate(${m}{route="/api/x"}[5m])))`,
  );
});

test('Prometheus: query_range in seconds, step 60, seconds → ms, NaN/Inf skipped', async () => {
  const fetchImpl = fakeFetch({
    data: {
      result: [
        {
          metric: { route: '/api/boards/:boardId' },
          values: [
            [1788260400, '0.25'],
            [1788260460, 'NaN'],
            [1788260520, '+Inf'],
            [1788260580, '1.5'],
          ],
        },
        { metric: {}, values: [[1788260400, '0.1']] },
        { metric: { route: '/x' } },
      ],
    },
  });
  const prom = createPrometheusMetricsSource({ url: 'http://prom', timeoutMs: 5, fetchImpl });
  const points = await prom.latency({ from, to, quantile: 0.95, route: '/api/boards/:boardId' });
  const { url } = call(fetchImpl);
  expect(url.pathname).toBe('/api/v1/query_range');
  expect(Object.fromEntries(url.searchParams)).toEqual({
    query: latencyQuery('orqea_http_request_duration_seconds_bucket', {
      quantile: 0.95,
      route: '/api/boards/:boardId',
    }),
    start: '1788260400',
    end: '1788264000',
    step: '60',
  });
  expect(points).toEqual([
    { route: '/api/boards/:boardId', ts: '2026-09-01T11:00:00.000Z', valueMs: 250 },
    { route: '/api/boards/:boardId', ts: '2026-09-01T11:03:00.000Z', valueMs: 1500 },
    { route: null, ts: '2026-09-01T11:00:00.000Z', valueMs: 100 },
  ]);
});

test('Prometheus: custom metric name, bad response refused', async () => {
  const f = fakeFetch({ data: { result: [] } });
  const prom = createPrometheusMetricsSource({
    url: 'http://p',
    timeoutMs: 5,
    metric: 'm_bucket',
    fetchImpl: f,
  });
  await prom.latency({ from, to, quantile: 0.95 });
  expect(call(f).url.searchParams.get('query')).toContain('rate(m_bucket[5m])');
  const bad = createPrometheusMetricsSource({
    url: 'http://p',
    timeoutMs: 5,
    fetchImpl: fakeFetch({ status: 'error' }),
  });
  await expect(bad.latency({ from, to, quantile: 0.95 })).rejects.toThrow('upstream_bad_response');
});

// --- GlitchTip / Sentry --------------------------------------------------------------------

test('errors project is org/project', () => {
  expect(parseProject('orqea/backend')).toBe('orqea/backend');
  expect(parseProject('orqea')).toBeNull();
  expect(parseProject('a/b/c')).toBeNull();
  expect(parseProject(null)).toBeNull();
});

test('GlitchTip: Sentry issues API with bearer token and window, mapped to ErrorsSource', async () => {
  const fetchImpl = fakeFetch([
    {
      id: '42',
      shortId: 'BACKEND-1',
      title: 'TypeError: x is undefined',
      count: '17',
      firstSeen: '2026-08-30T10:00:00Z',
      lastSeen: '2026-09-01T11:59:00Z',
      culprit: '/api/boards/:boardId',
    },
    {
      shortId: 'BACKEND-2',
      title: 'Error: user ada@example.com not found',
      metadata: { type: 'NotFoundError' },
      count: 'many',
      firstSeen: 'f',
      lastSeen: 'l',
      culprit: 'handler in routes/boards.js',
    },
  ]);
  const gt = createGlitchtipErrorsSource({
    url: 'https://gt.example/',
    token: 'tok',
    project: 'orqea/backend',
    timeoutMs: 5,
    fetchImpl,
  });
  expect(gt.hasToken).toBe(true);
  const issues = await gt.issues({ from, to });
  const { url, init } = call(fetchImpl);
  expect(url.pathname).toBe('/api/0/projects/orqea/backend/issues/');
  expect(Object.fromEntries(url.searchParams)).toEqual({
    start: '2026-09-01T11:00:00.000Z',
    end: '2026-09-01T12:00:00.000Z',
    query: 'is:unresolved',
    limit: '100',
  });
  expect(init.headers.authorization).toBe('Bearer tok');
  expect(issues).toEqual([
    {
      fingerprint: '42',
      title: 'TypeError: x is undefined',
      count: 17,
      firstSeen: '2026-08-30T10:00:00Z',
      lastSeen: '2026-09-01T11:59:00Z',
      route: '/api/boards/:boardId',
    },
    {
      fingerprint: 'BACKEND-2',
      title: 'NotFoundError',
      count: 0,
      firstSeen: 'f',
      lastSeen: 'l',
      route: null,
    },
  ]);
});

test('GlitchTip: untitled issue falls back to "error"; non-array response refused', async () => {
  expect(mapIssue({ id: 1, count: 2 })).toMatchObject({
    fingerprint: '1',
    title: 'error',
    count: 2,
    route: null,
  });
  const gt = createGlitchtipErrorsSource({
    url: 'http://gt',
    token: null,
    project: 'o/p',
    timeoutMs: 5,
    fetchImpl: fakeFetch({ detail: 'x' }),
  });
  expect(gt.hasToken).toBe(false);
  await expect(gt.issues({ from, to })).rejects.toThrow('upstream_bad_response');
});

// --- Issue sink ----------------------------------------------------------------------------

test('Orqea issue sink: POST opens and returns ref, PUT updates the encoded ref, bearer token', async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, status: 201, text: async () => '{"ref":"card/7"}' })
    .mockResolvedValueOnce({ ok: true, status: 200, text: async () => '' });
  const sink = createOrqeaIssueSink({
    url: 'https://orqea/api/vigie/issues/',
    token: 'tok',
    timeoutMs: 5,
    fetchImpl,
  });
  const payload = { schema: 1, incidentId: 1 };
  expect(await sink.open(payload)).toEqual({ ref: 'card/7' });
  expect(await sink.update('card/7', payload)).toBeUndefined();
  const open = call(fetchImpl, 0);
  const update = call(fetchImpl, 1);
  expect([open.raw, open.init.method, open.body]).toEqual([
    'https://orqea/api/vigie/issues',
    'POST',
    payload,
  ]);
  expect([update.raw, update.init.method, update.body]).toEqual([
    'https://orqea/api/vigie/issues/card%2F7',
    'PUT',
    payload,
  ]);
  expect(open.init.headers.authorization).toBe('Bearer tok');
  expect(update.init.headers.authorization).toBe('Bearer tok');
});

test('Orqea issue sink refuses a response without ref and surfaces HTTP errors', async () => {
  for (const body of [{}, { ref: '' }, { ref: 7 }, '']) {
    const sink = createOrqeaIssueSink({
      url: 'http://o',
      token: null,
      timeoutMs: 5,
      fetchImpl: fakeFetch(body),
    });
    await expect(sink.open({})).rejects.toThrow('upstream_bad_response');
  }
  const down = createOrqeaIssueSink({
    url: 'http://o',
    token: null,
    timeoutMs: 5,
    fetchImpl: fakeFetch('', { ok: false, status: 500 }),
  });
  expect(down.hasToken).toBe(false);
  await expect(down.update('r', {})).rejects.toMatchObject({ code: 'upstream_error' });
});

// --- Figura --------------------------------------------------------------------------------

test('Figura: replay, status and personas on /api/vigie with bearer token', async () => {
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, text: async () => '{"runId":"r 1"}' })
    .mockResolvedValueOnce({
      ok: true,
      text: async () => '{"state":"reproduced","evidence":{"steps":3}}',
    })
    .mockResolvedValueOnce({ ok: true, text: async () => '{"accepted":12}' });
  const figura = createHttpFigura({
    url: 'http://figura/',
    token: 't'.repeat(32),
    timeoutMs: 5,
    fetchImpl,
  });
  const client = createFiguraClient({ dev: null, recette: figura });
  const scenario = { targetEnv: 'recette', steps: [] };
  expect(await client.replay(scenario)).toEqual({ runId: 'recette:r 1' });
  expect(await client.status('recette:r 1')).toEqual({
    state: 'reproduced',
    evidence: { steps: 3 },
  });
  expect(await client.pushPersonas({ targetEnv: 'recette', personas: [] })).toEqual({
    accepted: 12,
  });
  const [a, b, c] = [0, 1, 2].map((i) => call(fetchImpl, i));
  expect([a.raw, a.init.method, a.body]).toEqual([
    'http://figura/api/vigie/replays',
    'POST',
    scenario,
  ]);
  expect([b.raw, b.init.method]).toEqual(['http://figura/api/vigie/replays/r%201', 'GET']);
  expect([c.raw, c.init.method, c.body]).toEqual([
    'http://figura/api/vigie/personas',
    'POST',
    { targetEnv: 'recette', personas: [] },
  ]);
  for (const x of [a, b, c]) expect(x.init.headers.authorization).toBe(`Bearer ${'t'.repeat(32)}`);
});

test('Figura: unknown state, missing runId, missing accepted are refused; evidence defaults to null', async () => {
  const one = (body) =>
    createHttpFigura({ url: 'http://f', token: 'x', timeoutMs: 5, fetchImpl: fakeFetch(body) });
  await expect(one({ state: 'done' }).status('1')).rejects.toThrow('upstream_bad_response');
  await expect(one('').status('1')).rejects.toThrow('upstream_bad_response');
  expect(await one({ state: 'queued' }).status('1')).toEqual({ state: 'queued', evidence: null });
  await expect(one({}).replay({})).rejects.toThrow('upstream_bad_response');
  await expect(one({ runId: '' }).replay({})).rejects.toThrow('upstream_bad_response');
  await expect(one({}).pushPersonas({})).rejects.toThrow('upstream_bad_response');
  expect(await one({ accepted: false }).pushPersonas({})).toEqual({ accepted: false });
});

test('Figura: an unreachable or unready target is inconclusive, any other failure stays failed', async () => {
  const one = (body) =>
    createHttpFigura({ url: 'http://f', token: 'x', timeoutMs: 5, fetchImpl: fakeFetch(body) });
  for (const error of ['TARGET_UNREACHABLE: page.goto timeout', 'TARGET_NOT_READY']) {
    expect((await one({ state: 'failed', error }).status('1')).state).toBe('inconclusive');
  }
  expect((await one({ state: 'failed', error: 'REPLAY_INCOMPLETE' }).status('1')).state).toBe(
    'failed',
  );
  expect((await one({ state: 'failed' }).status('1')).state).toBe('failed');
  expect((await one({ state: 'reproduced', error: 'TARGET_NOT_READY' }).status('1')).state).toBe(
    'reproduced',
  );
});

test('Figura refuses prod before any HTTP call, even with a real client wired', async () => {
  const fetchImpl = fakeFetch({ runId: 'x' });
  const real = createHttpFigura({ url: 'http://f', token: 'x', timeoutMs: 5, fetchImpl });
  const client = createFiguraClient({ dev: real, recette: real, prod: real });
  await expect(client.replay({ targetEnv: 'prod' })).rejects.toThrow('figura_target_forbidden');
  expect(fetchImpl).not.toHaveBeenCalled();
});

// --- Registry wiring -----------------------------------------------------------------------

test('registry hands each real adapter its settings (selector, metric, project, figura token)', () => {
  const a = createAdapters(
    loadConfig({
      VIGIE_LOKI_URL_PROD: 'http://loki',
      VIGIE_LOKI_SELECTOR: '{app="x"}',
      VIGIE_PROMETHEUS_URL_PROD: 'http://prom',
      VIGIE_ERRORS_URL_PROD: 'http://gt',
      VIGIE_ERRORS_TOKEN_PROD: 'tok',
      VIGIE_ERRORS_PROJECT_PROD: 'o/p',
      VIGIE_FIGURA_URL_DEV: 'http://f',
      VIGIE_FIGURA_TOKEN_DEV: 'z'.repeat(32),
      VIGIE_ISSUES_URL: 'http://o',
    }),
    { clock: fixedClock('2026-09-01T12:00:00Z') },
  );
  expect(a.sources.prod.logs.impl).toMatchObject({ url: 'http://loki', selector: '{app="x"}' });
  expect(a.sources.prod.metrics.impl).toMatchObject({
    url: 'http://prom',
    metric: 'orqea_http_request_duration_seconds_bucket',
  });
  expect(a.sources.prod.errors.impl).toMatchObject({ hasToken: true, project: 'o/p' });
  expect(a.figuraSlots.dev).toMatchObject({
    status: 'configured',
    impl: { url: 'http://f', hasToken: true },
  });
  expect(a.figuraSlots.recette.status).toBe('not_configured');
  expect(a.issues.impl.hasToken).toBe(false);
});
