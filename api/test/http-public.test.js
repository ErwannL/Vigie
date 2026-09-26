import { afterAll, expect, test } from 'vitest';
import { errorResponse } from '../src/http/app.js';
import { AppError } from '../src/errors.js';
import { ingestAuth, login, ssoToken, testApp } from './http-helpers.js';
import { SECRETS, makeEvent, testDb } from './helpers.js';

afterAll(async () => (await testDb()).close());

test('health, readiness and 503 when storage is unreachable', async () => {
  const { app, container } = await testApp();
  expect((await app.inject('/healthz')).json()).toEqual({ status: 'ok' });
  expect((await app.inject('/readyz')).json()).toEqual({ status: 'ready' });
  container.db.ping = async () => {
    throw new Error('down');
  };
  const res = await app.inject('/readyz');
  expect(res.statusCode).toBe(503);
  expect(res.json()).toEqual({ status: 'unavailable' });
});

test('every response can be framed by the admin console, never DENY', async () => {
  const { app } = await testApp();
  const res = await app.inject('/healthz');
  expect(res.headers['content-security-policy']).toContain(
    'frame-ancestors https://admin.orqea.test',
  );
  expect(res.headers['x-frame-options']).toBeUndefined();
  expect(res.headers['cache-control']).toBe('no-store');
  expect((await app.inject('/nope')).json()).toEqual({ error: 'not_found' });
});

const post = (app, events, headers = ingestAuth('prod')) =>
  app.inject({ method: 'POST', url: '/v1/events', headers, payload: { events } });

test('ingestion: 202 with per-event rejections; one bad event never rejects the batch', async () => {
  const { app, container } = await testApp();
  const good = makeEvent();
  const res = await post(app, [
    good,
    makeEvent({ env: 'dev' }),
    makeEvent({ target: { page: '/board/42' } }),
  ]);
  expect(res.statusCode).toBe(202);
  expect(res.json()).toEqual({
    accepted: 1,
    rejected: [
      { index: 1, code: 'env_mismatch' },
      { index: 2, code: 'page_not_template' },
    ],
  });
  expect((await post(app, [good])).json()).toEqual({ accepted: 1, rejected: [] });
  const stored = await container.db.query('SELECT env, count(*) AS n FROM events GROUP BY env');
  expect(stored.rows).toEqual([{ env: 'prod', n: 1 }]);
});

test('the credential decides the environment', async () => {
  const { app, container } = await testApp();
  await post(app, [makeEvent({ env: 'recette' })], ingestAuth('recette'));
  const res = await post(app, [makeEvent({ env: 'prod' })], ingestAuth('recette'));
  expect(res.json().rejected).toEqual([{ index: 0, code: 'env_mismatch' }]);
  const stored = await container.db.query('SELECT env FROM events');
  expect(stored.rows).toEqual([{ env: 'recette' }]);
});

test('ingestion auth: missing, wrong or short secrets get 401', async () => {
  const { app } = await testApp({ vars: { VIGIE_INGEST_SECRET_DEV: 'short-secret' } });
  expect((await post(app, [], {})).statusCode).toBe(401);
  expect((await post(app, [], { authorization: `Bearer ${'z'.repeat(40)}` })).json()).toEqual({
    error: 'unauthorized',
  });
  expect((await post(app, [], { authorization: 'Bearer short-secret' })).statusCode).toBe(401);
  expect((await post(app, [], { authorization: `Bearer ${SECRETS.session}` })).statusCode).toBe(
    401,
  );
});

test('batch limits: 500 events, 1 MB, JSON object with an events array', async () => {
  const { app } = await testApp();
  expect(
    (
      await post(
        app,
        Array.from({ length: 501 }, () => ({})),
      )
    ).json(),
  ).toEqual({ error: 'too_many_events' });
  const big = { events: [makeEvent({ padding: 'x'.repeat(1100 * 1024) })] };
  const res = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: ingestAuth('prod'),
    payload: big,
  });
  expect([res.statusCode, res.json()]).toEqual([413, { error: 'payload_too_large' }]);
  const nearlyBig = { events: [makeEvent({ padding: 'x'.repeat(200 * 1024) })] };
  const ok = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: ingestAuth('prod'),
    payload: nearlyBig,
  });
  expect(ok.json().rejected[0].code).toBe('unknown_field');
  expect(
    (
      await app.inject({
        method: 'POST',
        url: '/v1/events',
        headers: ingestAuth('prod'),
        payload: { x: 1 },
      })
    ).json(),
  ).toEqual({
    error: 'invalid_batch',
  });
  const broken = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: { ...ingestAuth('prod'), 'content-type': 'application/json' },
    payload: '{"events": [',
  });
  expect([broken.statusCode, broken.json()]).toEqual([400, { error: 'invalid_request' }]);
  const text = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: { ...ingestAuth('prod'), 'content-type': 'text/csv' },
    payload: 'a,b',
  });
  expect([text.statusCode, text.json()]).toEqual([415, { error: 'unsupported_media_type' }]);
});

test('GDPR: export and erase a pseudonymous subject, idempotently, in the credential environment', async () => {
  const { app } = await testApp();
  await post(app, [makeEvent(), makeEvent(), makeEvent({ user: 'other_user_1' })]);
  const url = '/v1/subjects/user_000001';
  const exported = await app.inject({ url, headers: ingestAuth('prod') });
  expect(exported.json()).toMatchObject({ env: 'prod', user: 'user_000001' });
  expect(exported.json().events).toHaveLength(2);
  expect((await app.inject({ url, headers: ingestAuth('recette') })).json().events).toEqual([]);
  const erase = () => app.inject({ method: 'DELETE', url, headers: ingestAuth('prod') });
  expect((await erase()).json()).toEqual({ env: 'prod', user: 'user_000001', deleted: 2 });
  expect((await erase()).json()).toEqual({ env: 'prod', user: 'user_000001', deleted: 0 });
  expect((await app.inject({ url, headers: ingestAuth('prod') })).json().events).toEqual([]);
  expect(
    (
      await app.inject({ url: '/v1/subjects/jane@example.com', headers: ingestAuth('prod') })
    ).json(),
  ).toEqual({
    error: 'invalid_user',
  });
  expect((await app.inject({ url })).statusCode).toBe(401);
});

test('SSO handoff: valid once, then replay is refused; bad tokens get codes', async () => {
  const { app, container, clock } = await testApp();
  const token = ssoToken(clock);
  const first = await app.inject({ method: 'POST', url: '/auth/sso', payload: { token } });
  expect(first.statusCode).toBe(200);
  expect(first.json()).toMatchObject({
    operator: { sub: 'op-1', name: 'Ada Lovelace' },
    expiresAt: '2026-09-01T12:30:00.000Z',
  });
  const again = await app.inject({ method: 'POST', url: '/auth/sso', payload: { token } });
  expect([again.statusCode, again.json()]).toEqual([401, { error: 'sso_replayed' }]);
  const expired = await app.inject({
    method: 'POST',
    url: '/auth/sso',
    payload: { token: ssoToken(clock, { iat: 1, exp: 61 }) },
  });
  expect(expired.json()).toEqual({ error: 'sso_expired' });
  expect((await app.inject({ method: 'POST', url: '/auth/sso' })).json()).toEqual({
    error: 'sso_malformed',
  });
  const nameless = await app.inject({
    method: 'POST',
    url: '/auth/sso',
    payload: { token: ssoToken(clock, { sub: undefined, name: undefined, operator: 'op-2' }) },
  });
  expect(nameless.json().operator).toEqual({ sub: 'op-2', name: 'op-2' });
  const audit = await container.db.query(
    "SELECT operator, operator_name FROM audit_log WHERE action = 'sso.login' ORDER BY id",
  );
  expect(audit.rows).toEqual([
    { operator: 'op-1', operator_name: 'Ada Lovelace' },
    { operator: 'op-2', operator_name: 'op-2' },
  ]);
});

test('SSO and sessions are unavailable (503) when their secrets are not configured', async () => {
  const { app, clock } = await testApp({
    vars: { VIGIE_SSO_SECRET: '', VIGIE_SESSION_SECRET: '' },
  });
  const res = await app.inject({
    method: 'POST',
    url: '/auth/sso',
    payload: { token: ssoToken(clock) },
  });
  expect([res.statusCode, res.json()]).toEqual([503, { error: 'sso_not_configured' }]);
  expect((await app.inject('/v1/session')).json()).toEqual({ error: 'session_not_configured' });
  const half = await testApp({ vars: { VIGIE_SESSION_SECRET: '' } });
  expect(
    (
      await half.app.inject({
        method: 'POST',
        url: '/auth/sso',
        payload: { token: ssoToken(clock) },
      })
    ).statusCode,
  ).toBe(503);
});

test('logs never contain event bodies, tokens or secrets; request traces are debug level', async () => {
  const { app, sink, clock } = await testApp();
  const token = ssoToken(clock);
  const headers = await login(app, clock);
  await app.inject({ method: 'POST', url: '/auth/sso', payload: { token } });
  await post(app, [
    makeEvent({ user: 'user_secret_1', error: { kind: 'K', message: 'card is null' } }),
  ]);
  await app.inject({ url: '/v1/subjects/user_secret_1', headers: ingestAuth('prod') });
  await app.inject({ url: '/v1/session', headers });
  const text = sink.text();
  for (const secret of [
    ...Object.values(SECRETS),
    token,
    headers.authorization.slice(7),
    'user_secret_1',
    'card is null',
  ]) {
    expect(text).not.toContain(secret);
  }
  const lines = sink.lines.map((l) => JSON.parse(l));
  const requestLines = lines.filter((l) => l.msg === 'request');
  expect(requestLines.length).toBeGreaterThan(3);
  expect(requestLines.every((l) => l.level === 20)).toBe(true);
  expect(requestLines.map((l) => l.req.route)).toContain('/v1/subjects/:user');
  expect(lines.some((l) => l.level >= 30 && l.msg === 'request')).toBe(false);
});

test('error mapping never leaks raw messages', async () => {
  expect(errorResponse(new AppError('x', 409))).toEqual({ status: 409, code: 'x' });
  expect(errorResponse(new Error('secret detail'))).toEqual({
    status: 500,
    code: 'internal_error',
  });
  const { app, sink } = await testApp();
  app.get('/boom', async () => {
    throw new Error('secret detail');
  });
  app.get('/coded', async () => {
    throw Object.assign(new Error('x'), { code: 'EWHATEVER' });
  });
  const res = await app.inject('/boom');
  expect([res.statusCode, res.json()]).toEqual([500, { error: 'internal_error' }]);
  expect(sink.text()).toContain('request failed');
  expect(sink.text()).not.toContain('secret detail');
  expect((await app.inject('/coded')).statusCode).toBe(500);
});
