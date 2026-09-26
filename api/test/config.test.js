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
  expect(c.ssoIssuer).toBe('orqea-admin-console');
  expect(c.lokiSelector).toBe('{container=~".*backend.*"}');
  expect(c.prometheusMetric).toBe('orqea_http_request_duration_seconds_bucket');
});

test('reads per-environment sources, secrets and bounded integers', () => {
  const c = loadConfig({
    VIGIE_MODE: 'development',
    VIGIE_PORT: '99999',
    VIGIE_RAW_RETENTION_DAYS: '0',
    VIGIE_LOKI_URL_PROD: ' http://loki ',
    VIGIE_ERRORS_URL_RECETTE: 'http://gt',
    VIGIE_ERRORS_TOKEN_RECETTE: 'tok',
    VIGIE_ERRORS_PROJECT_RECETTE: 'orqea/backend',
    VIGIE_ERRORS_URL_PROD: 'http://gt-prod',
    VIGIE_ERRORS_PROJECT_PROD: 'orqea/backend',
    VIGIE_ERRORS_URL_DEV: 'http://gt-dev',
    VIGIE_ERRORS_PROJECT_DEV: 'not a project',
    VIGIE_FIGURA_URL_RECETTE: 'http://figura',
    VIGIE_FIGURA_TOKEN_RECETTE: 'f'.repeat(32),
    VIGIE_FIGURA_URL_DEV: 'http://figura-dev',
    VIGIE_FIGURA_TOKEN_DEV: 'too-short',
    VIGIE_SSO_ISSUER: 'custom-issuer',
    VIGIE_LOKI_SELECTOR: '{app="x"}',
    VIGIE_PROMETHEUS_METRIC: 'm_bucket',
    VIGIE_INGEST_SECRET_PROD: 'p'.repeat(32),
    VIGIE_INGEST_SECRET_DEV: 'short',
    VIGIE_ALLOWED_FRAME_ANCESTORS: "self, https://a.test 'none'",
    VIGIE_AUTO_REPLAY_TARGET: 'recette',
  });
  expect(c.mode).toBe('development');
  expect(c.port).toBe(65535);
  expect(c.rawRetentionDays).toBe(1);
  expect(c.sources.logs).toEqual({ dev: null, recette: null, prod: 'http://loki' });
  expect(c.sources.errors).toEqual({
    dev: null,
    recette: { url: 'http://gt', token: 'tok', project: 'orqea/backend' },
    prod: { url: 'http://gt-prod', token: null, project: 'orqea/backend' },
  });
  expect(c.figura).toEqual({ dev: null, recette: { url: 'http://figura', token: 'f'.repeat(32) } });
  expect(c.ssoIssuer).toBe('custom-issuer');
  expect(c.lokiSelector).toBe('{app="x"}');
  expect(c.prometheusMetric).toBe('m_bucket');
  expect(c.ingestSecrets.prod).toBe('p'.repeat(32));
  expect(c.ingestSecrets.dev).toBeNull();
  expect(c.allowedFrameAncestors).toBe("'self' https://a.test 'none'");
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
