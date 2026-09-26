import { expect, test } from 'vitest';
import { loadConfig, secretOrNull } from '../src/config.js';
import { ENVS, assertEnv, assertFiguraTarget, isEnv } from '../src/env.js';
import { AppError, NotImplementedError } from '../src/errors.js';

test('a secret shorter than 32 characters is treated as absent', () => {
  expect(secretOrNull('a'.repeat(31))).toBeNull();
  expect(secretOrNull(undefined)).toBeNull();
  expect(secretOrNull('a'.repeat(32))).toBe('a'.repeat(32));
});

test('defaults are safe: production mode, 60 days retention, no secrets', () => {
  const c = loadConfig({});
  expect(c.mode).toBe('production');
  expect(c.rawRetentionDays).toBe(60);
  expect(c.ingestSecrets).toEqual({ dev: null, recette: null, prod: null });
  expect(c.ssoSecret).toBeNull();
  expect(c.allowedFrameAncestors).toBe("'self'");
  expect(c.autoReplayTarget).toBeNull();
  expect(c.publicUrl).toBeNull();
  expect(c.port).toBe(3000);
  expect(c.figura).toEqual({ dev: null, recette: null });
});

test('reads per-environment sources, secrets and bounded integers', () => {
  const c = loadConfig({
    VIGIE_MODE: 'development',
    VIGIE_PORT: '99999',
    VIGIE_RAW_RETENTION_DAYS: '0',
    VIGIE_LOKI_URL_PROD: ' http://loki ',
    VIGIE_ERRORS_URL_RECETTE: 'http://gt',
    VIGIE_ERRORS_TOKEN_RECETTE: 'tok',
    VIGIE_ERRORS_URL_PROD: 'http://gt-prod',
    VIGIE_FIGURA_URL_RECETTE: 'http://figura',
    VIGIE_INGEST_SECRET_PROD: 'p'.repeat(32),
    VIGIE_INGEST_SECRET_DEV: 'short',
    VIGIE_ALLOWED_FRAME_ANCESTORS: 'https://a.test, https://b.test',
    VIGIE_AUTO_REPLAY_TARGET: 'recette',
  });
  expect(c.mode).toBe('development');
  expect(c.port).toBe(65535);
  expect(c.rawRetentionDays).toBe(1);
  expect(c.sources.logs).toEqual({ dev: null, recette: null, prod: 'http://loki' });
  expect(c.sources.errors.recette).toEqual({ url: 'http://gt', token: 'tok' });
  expect(c.sources.errors.prod).toEqual({ url: 'http://gt-prod', token: null });
  expect(c.figura.recette).toBe('http://figura');
  expect(c.ingestSecrets.prod).toBe('p'.repeat(32));
  expect(c.ingestSecrets.dev).toBeNull();
  expect(c.allowedFrameAncestors).toBe('https://a.test https://b.test');
  expect(c.autoReplayTarget).toBe('recette');
});

test('the SSO secret must differ from the session secret', () => {
  const same = 'z'.repeat(40);
  expect(() => loadConfig({ VIGIE_SSO_SECRET: same, VIGIE_SESSION_SECRET: same })).toThrow(
    'config_sso_secret_must_differ_from_session_secret',
  );
});

test('auto replay can never target prod', () => {
  expect(() => loadConfig({ VIGIE_AUTO_REPLAY_TARGET: 'prod' })).toThrow(
    'config_invalid_auto_replay_target',
  );
});

test('environment guards', () => {
  expect(ENVS).toEqual(['dev', 'recette', 'prod']);
  expect(isEnv('prod')).toBe(true);
  expect(assertEnv('recette')).toBe('recette');
  expect(() => assertEnv(undefined)).toThrow('invalid_env');
  expect(() => assertEnv('staging')).toThrow(AppError);
  expect(assertFiguraTarget('dev')).toBe('dev');
  expect(() => assertFiguraTarget('prod')).toThrow('figura_target_forbidden');
});

test('errors carry a code and a status', () => {
  const err = new AppError('x', 418, { a: 1 });
  expect([err.code, err.statusCode, err.details]).toEqual(['x', 418, { a: 1 }]);
  expect(new AppError('y').statusCode).toBe(500);
  const ni = new NotImplementedError('Thing.do');
  expect([ni.name, ni.code, ni.statusCode, ni.details.what]).toEqual([
    'NotImplemented',
    'not_implemented',
    501,
    'Thing.do',
  ]);
});
