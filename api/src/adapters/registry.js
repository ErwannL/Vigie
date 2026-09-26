import { ENVS, FIGURA_TARGETS } from '../env.js';
import { createFakeErrorsSource } from './errors/fake.js';
import { createGlitchtipErrorsSource } from './errors/glitchtip.js';
import { createFiguraClient } from './figura/client.js';
import { createFakeFigura } from './figura/fake.js';
import { createHttpFigura } from './figura/figura.js';
import { createFakeIssueSink } from './issues/fake.js';
import { createOrqeaIssueSink } from './issues/orqea.js';
import { createFakeLogsSource } from './logs/fake.js';
import { createLokiLogsSource } from './logs/loki.js';
import { createFakeMetricsSource } from './metrics/fake.js';
import { createPrometheusMetricsSource } from './metrics/prometheus.js';

/**
 * Picks an implementation for one adapter slot:
 * configured → the real implementation; missing in development → the fake;
 * missing otherwise → disabled, shown as "not configured".
 */
function pick(settings, mode, real, fake) {
  if (settings) return { status: 'configured', impl: real(settings) };
  if (mode === 'development') return { status: 'fake', impl: fake() };
  return { status: 'not_configured', impl: null };
}

function envFixtures(fixtures, env) {
  return fixtures[env] ?? { logs: [], metrics: [], errors: [] };
}

export function createAdapters(config, { clock, fixtures = {} }) {
  const timeoutMs = config.httpTimeoutMs;
  const sources = Object.fromEntries(
    ENVS.map((env) => {
      const fx = envFixtures(fixtures, env);
      const { logs, metrics, errors } = config.sources;
      return [
        env,
        {
          logs: pick(
            logs[env],
            config.mode,
            (url) => createLokiLogsSource({ url, timeoutMs }),
            () => createFakeLogsSource(fx.logs, clock),
          ),
          metrics: pick(
            metrics[env],
            config.mode,
            (url) => createPrometheusMetricsSource({ url, timeoutMs }),
            () => createFakeMetricsSource(fx.metrics, clock),
          ),
          errors: pick(
            errors[env],
            config.mode,
            (s) => createGlitchtipErrorsSource({ ...s, timeoutMs }),
            () => createFakeErrorsSource(fx.errors, clock),
          ),
        },
      ];
    }),
  );
  const figuraSlots = Object.fromEntries(
    FIGURA_TARGETS.map((t) => [
      t,
      pick(
        config.figura[t],
        config.mode,
        (url) => createHttpFigura({ url, timeoutMs }),
        () => createFakeFigura(),
      ),
    ]),
  );
  const issues = pick(
    config.issues.url ? config.issues : null,
    config.mode,
    (s) => createOrqeaIssueSink({ ...s, timeoutMs }),
    () => createFakeIssueSink(),
  );
  return {
    sources,
    figuraSlots,
    figura: createFiguraClient(
      Object.fromEntries(FIGURA_TARGETS.map((t) => [t, figuraSlots[t].impl])),
    ),
    issues,
  };
}

/** Source status for the Settings page: configured / fake / not_configured. */
export function adapterStatus(adapters) {
  const statusOf = (slots) =>
    Object.fromEntries(Object.entries(slots).map(([k, v]) => [k, v.status]));
  return {
    sources: Object.fromEntries(ENVS.map((env) => [env, statusOf(adapters.sources[env])])),
    figura: statusOf(adapters.figuraSlots),
    issues: adapters.issues.status,
  };
}
