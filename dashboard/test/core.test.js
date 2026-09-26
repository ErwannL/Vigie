import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, vi } from 'vitest';
import { ApiError, createApi } from '../src/api.js';
import { count, dateTime, ms, percent, signedPercent } from '../src/format.js';
import { DICTIONARIES, errorKey, initialLanguage, translate } from '../src/i18n/index.js';
import { takeHandoff } from '../src/sso.js';
import { clearSession, loadSession, safeStorage, saveSession } from '../src/storage.js';

const ok = (data, status = 200) => ({ ok: status < 400, status, json: async () => data });

test('the API client sends the bearer, JSON bodies and a timeout signal', async () => {
  const fetchImpl = vi.fn(async () => ok({ a: 1 }));
  const api = createApi({ base: '/api', fetchImpl, timeoutMs: 50 });
  expect(await api.settings()).toEqual({ a: 1 });
  expect(fetchImpl.mock.calls[0][1].headers).toEqual({});
  api.setToken('tok');
  await api.replay('prod', 3, 'recette');
  const [url, init] = fetchImpl.mock.calls[1];
  expect(url).toBe('/api/v1/incidents/3/replay?env=prod');
  expect(init).toMatchObject({ method: 'POST', body: '{"targetEnv":"recette"}' });
  expect(init.headers).toEqual({ authorization: 'Bearer tok', 'content-type': 'application/json' });
  expect(init.signal).toBeInstanceOf(AbortSignal);
});

test('every endpoint targets the right URL with the env as a parameter', async () => {
  const fetchImpl = vi.fn(async () => ok({}));
  const api = createApi({ base: '', fetchImpl });
  await api.login('jwt');
  await api.incidents('prod', '');
  await api.incidents('prod', 'open');
  await api.incident('recette', 4);
  await api.resolve('prod', 4);
  await api.detect('dev');
  await api.routes('prod');
  await api.compare(['prod', 'recette'], '/api/x', 14);
  await api.insight('usage', 'prod', { days: '7' });
  await api.insight('landing', 'prod');
  await api.previewPersonas({ sourceEnv: 'prod' });
  await api.pushPersonas({ sourceEnv: 'prod' });
  await api.personaSets('prod');
  expect(fetchImpl.mock.calls.map((c) => `${c[1].method} ${c[0]}`)).toEqual([
    'POST /auth/sso',
    'GET /v1/incidents?env=prod',
    'GET /v1/incidents?env=prod&status=open',
    'GET /v1/incidents/4?env=recette',
    'POST /v1/incidents/4/resolve?env=prod',
    'POST /v1/detect?env=dev',
    'GET /v1/routes?env=prod',
    'GET /v1/compare/latency?envs=prod%2Crecette&route=%2Fapi%2Fx&days=14',
    'GET /v1/insights/usage?env=prod&days=7',
    'GET /v1/insights/landing?env=prod',
    'POST /v1/personas/preview',
    'POST /v1/personas/push',
    'GET /v1/personas?env=prod',
  ]);
});

test('errors become ApiError codes; 401 with a session reports expiry', async () => {
  const onUnauthorized = vi.fn();
  const fetchImpl = vi
    .fn()
    .mockResolvedValueOnce(ok({ error: 'figura_target_forbidden' }, 400))
    .mockResolvedValueOnce({ ok: false, status: 502, json: async () => JSON.parse('<html>') })
    .mockRejectedValueOnce(new TypeError('offline'))
    .mockResolvedValueOnce(ok({ error: 'unauthorized' }, 401))
    .mockResolvedValueOnce(ok({ error: 'unauthorized' }, 401))
    .mockResolvedValueOnce(ok({ error: 'unauthorized' }, 401));
  const api = createApi({ base: '', fetchImpl });
  await expect(api.settings()).rejects.toMatchObject({
    code: 'figura_target_forbidden',
    status: 400,
  });
  await expect(api.settings()).rejects.toMatchObject({ code: 'unknown', status: 502 });
  await expect(api.settings()).rejects.toMatchObject({ code: 'network_error', status: 0 });
  await expect(api.login('bad')).rejects.toBeInstanceOf(ApiError);
  api.setToken('tok');
  await expect(api.settings()).rejects.toMatchObject({ code: 'unauthorized' });
  api.onUnauthorized(onUnauthorized);
  await expect(api.settings()).rejects.toMatchObject({ code: 'unauthorized' });
  expect(onUnauthorized).toHaveBeenCalledTimes(1);
});

test('the SSO fragment is read and removed from the URL at once', () => {
  const history = { replaceState: vi.fn() };
  const location = { hash: '#sso=a.b%2Ec', pathname: '/vigie/', search: '?x=1' };
  expect(takeHandoff(location, history)).toEqual({ token: 'a.b.c', env: null });
  expect(history.replaceState).toHaveBeenCalledWith(null, '', '/vigie/?x=1');
  expect(takeHandoff({ ...location, hash: '#page=1&sso=tok' }, history)).toEqual({
    token: 'tok',
    env: null,
  });
  for (const env of ['dev', 'recette', 'prod']) {
    expect(takeHandoff({ ...location, hash: `#sso=t&env=${env}` }, history)).toEqual({
      token: 't',
      env,
    });
  }
  expect(takeHandoff({ ...location, hash: '#sso=t&env=staging' }, history)).toEqual({
    token: 't',
    env: null,
  });
  expect(takeHandoff({ ...location, hash: '#env=dev' }, history)).toBeNull();
  expect(takeHandoff({ ...location, hash: '' }, history)).toBeNull();
  expect(takeHandoff({ ...location, hash: '#nosso=1' }, history)).toBeNull();
  expect(history.replaceState).toHaveBeenCalledTimes(6);
  expect(history.replaceState).toHaveBeenLastCalledWith(null, '', '/vigie/?x=1');
});

test('storage never throws and sessions expire', () => {
  const broken = safeStorage(() => {
    throw new Error('blocked');
  });
  expect(broken.get('k')).toBeNull();
  expect(() => broken.set('k', 'v')).not.toThrow();
  expect(() => broken.remove('k')).not.toThrow();
  const store = safeStorage(() => window.sessionStorage);
  const now = new Date('2026-09-01T12:00:00Z');
  expect(loadSession(store, now)).toBeNull();
  saveSession(store, { token: 't', expiresAt: '2026-09-01T12:30:00Z', operator: { sub: 'x' } });
  expect(JSON.parse(store.get('vigie.session'))).toEqual({
    token: 't',
    expiresAt: '2026-09-01T12:30:00Z',
  });
  expect(loadSession(store, now)).toEqual({ token: 't', expiresAt: '2026-09-01T12:30:00Z' });
  expect(loadSession(store, new Date('2026-09-01T13:00:00Z'))).toBeNull();
  store.set('vigie.session', '{oops');
  expect(loadSession(store, now)).toBeNull();
  clearSession(store);
  expect(store.get('vigie.session')).toBeNull();
});

test('format helpers show masked counts as "< 10"', () => {
  const t = (k) => translate('en', k);
  expect(count({ value: null, masked: true }, t)).toBe('< 10');
  expect(count({ value: 1200, masked: false }, t)).toBe((1200).toLocaleString());
  expect([percent(null), percent(0.3125)]).toEqual(['—', '31.3 %']);
  expect([signedPercent(null), signedPercent(0.1), signedPercent(-0.02), signedPercent(0)]).toEqual(
    ['—', '+10 %', '-2 %', '0 %'],
  );
  expect([ms(null), ms(339.6)]).toEqual(['—', '340 ms']);
  expect(dateTime('2026-09-01T12:00:00Z', 'en')).toContain('2026');
});

test('i18n: placeholders, fallbacks and language detection', () => {
  expect(translate('fr', 'env.viewing', { env: 'prod' })).toBe('Vous regardez : prod');
  expect(translate('en', 'no.such.key')).toBe('no.such.key');
  expect(errorKey('sso_expired')).toBe('errors.sso_expired');
  expect(errorKey('something_new')).toBe('errors.unknown');
  expect(initialLanguage('fr', 'en-US')).toBe('fr');
  expect(initialLanguage(null, 'fr-CA')).toBe('fr');
  expect(initialLanguage('de', undefined)).toBe('en');
});

test('English and French have exactly the same keys, all non-empty', () => {
  const en = Object.keys(DICTIONARIES.en).sort();
  expect(Object.keys(DICTIONARIES.fr).sort()).toEqual(en);
  for (const lang of ['en', 'fr']) {
    for (const value of Object.values(DICTIONARIES[lang])) expect(value.trim()).not.toBe('');
  }
});

function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : [path];
  });
}

test('every literal translation key used in the source exists', () => {
  const files = sources(join(process.cwd(), 'src')).filter(
    (f) => /\.jsx?$/.test(f) && !f.includes('i18n'),
  );
  const used = new Set();
  for (const file of files) {
    for (const m of readFileSync(file, 'utf8').matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
  }
  expect(used.size).toBeGreaterThan(100);
  const missing = [...used].filter((k) => !(k in DICTIONARIES.en));
  expect(missing).toEqual([]);
});

test('every server error code the API can return has a translation', () => {
  const api = join(process.cwd(), '..', 'api', 'src');
  const codes = new Set();
  for (const file of sources(api).filter((f) => f.endsWith('.js'))) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/new AppError\('([a-z_]+)'/g)) codes.add(m[1]);
    for (const m of text.matchAll(/fail\('(sso_[a-z_]+)'\)/g)) codes.add(m[1]);
  }
  const serverOnly = [...codes].filter(
    (c) =>
      c.startsWith('config_') || ['invalid_batch', 'too_many_events', 'invalid_user'].includes(c),
  );
  const missing = [...codes].filter(
    (c) => !serverOnly.includes(c) && errorKey(c) === 'errors.unknown',
  );
  expect(codes.size).toBeGreaterThan(20);
  expect(missing).toEqual([]);
});
