import { AppError } from './errors.js';
import { ENVS, FIGURA_TARGETS } from './env.js';

export const MIN_SECRET_LENGTH = 32;

/** A secret shorter than 32 characters is treated as absent. */
export function secretOrNull(value) {
  return typeof value === 'string' && value.length >= MIN_SECRET_LENGTH ? value : null;
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function intOr(value, fallback, min, max) {
  const n = Number.parseInt(value ?? '', 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function perEnv(vars, prefix, envs = ENVS) {
  return Object.fromEntries(envs.map((e) => [e, nonEmpty(vars[`${prefix}_${e.toUpperCase()}`])]));
}

function errorsSources(vars) {
  const urls = perEnv(vars, 'VIGIE_ERRORS_URL');
  const tokens = perEnv(vars, 'VIGIE_ERRORS_TOKEN');
  return Object.fromEntries(
    ENVS.map((e) => [e, urls[e] ? { url: urls[e], token: tokens[e] } : null]),
  );
}

function frameAncestors(value) {
  const list = (nonEmpty(value) ?? "'self'").split(/[\s,]+/).filter(Boolean);
  return list.join(' ');
}

function autoReplayTarget(value) {
  const v = nonEmpty(value);
  if (v === null) return null;
  if (!FIGURA_TARGETS.includes(v)) throw new AppError('config_invalid_auto_replay_target', 500);
  return v;
}

function secrets(vars) {
  const ssoSecret = secretOrNull(vars.VIGIE_SSO_SECRET);
  const sessionSecret = secretOrNull(vars.VIGIE_SESSION_SECRET);
  if (ssoSecret !== null && ssoSecret === sessionSecret) {
    throw new AppError('config_sso_secret_must_differ_from_session_secret', 500);
  }
  return { ssoSecret, sessionSecret };
}

/**
 * Reads the whole configuration from environment variables. Pure: pass the variables in,
 * tests never depend on a developer .env.
 */
export function loadConfig(vars) {
  const mode = vars.VIGIE_MODE === 'development' ? 'development' : 'production';
  return Object.freeze({
    mode,
    host: nonEmpty(vars.VIGIE_HOST) ?? '0.0.0.0',
    port: intOr(vars.VIGIE_PORT, 3000, 1, 65535),
    databaseUrl: nonEmpty(vars.DATABASE_URL) ?? 'postgres://vigie:vigie@localhost:5432/vigie',
    publicUrl: nonEmpty(vars.VIGIE_PUBLIC_URL),
    logLevel: nonEmpty(vars.VIGIE_LOG_LEVEL) ?? 'info',
    ingestSecrets: Object.fromEntries(
      ENVS.map((e) => [e, secretOrNull(vars[`VIGIE_INGEST_SECRET_${e.toUpperCase()}`])]),
    ),
    ...secrets(vars),
    sessionTtlSeconds: intOr(vars.VIGIE_SESSION_TTL_SECONDS, 1800, 60, 43200),
    allowedFrameAncestors: frameAncestors(vars.VIGIE_ALLOWED_FRAME_ANCESTORS),
    rawRetentionDays: intOr(vars.VIGIE_RAW_RETENTION_DAYS, 60, 1, 3650),
    httpTimeoutMs: intOr(vars.VIGIE_HTTP_TIMEOUT_MS, 5000, 100, 60000),
    sources: {
      logs: perEnv(vars, 'VIGIE_LOKI_URL'),
      metrics: perEnv(vars, 'VIGIE_PROMETHEUS_URL'),
      errors: errorsSources(vars),
    },
    figura: perEnv(vars, 'VIGIE_FIGURA_URL', FIGURA_TARGETS),
    issues: { url: nonEmpty(vars.VIGIE_ISSUES_URL), token: nonEmpty(vars.VIGIE_ISSUES_TOKEN) },
    autoReplayTarget: autoReplayTarget(vars.VIGIE_AUTO_REPLAY_TARGET),
    detect: {
      intervalSeconds: intOr(vars.VIGIE_DETECT_INTERVAL_SECONDS, 300, 10, 86400),
      windowMinutes: intOr(vars.VIGIE_DETECT_WINDOW_MINUTES, 60, 5, 1440),
      baselineDays: intOr(vars.VIGIE_DETECT_BASELINE_DAYS, 7, 1, 60),
    },
  });
}
