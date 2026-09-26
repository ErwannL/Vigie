import { adapterStatus } from '../../adapters/registry.js';
import { catalogues } from '../../catalogues.js';
import { ENVS, FIGURA_TARGETS, assertEnv } from '../../env.js';
import { AppError } from '../../errors.js';
import { compareRoute, knownRoutes } from '../../jobs/rollup.js';

/** Operator routes about Vigie itself: session, catalogues, settings, env comparison. */
export function registerSettingsRoutes(app, deps) {
  const { config, db, adapters, clock } = deps;
  const guarded = { preHandler: app.requireSession };

  app.get('/v1/session', guarded, async (req) => ({ operator: req.operator }));

  app.get('/v1/catalogues', guarded, async () => catalogues());

  app.get('/v1/settings', guarded, async () => {
    const cat = catalogues();
    return {
      mode: config.mode,
      envs: ENVS,
      figuraTargets: FIGURA_TARGETS,
      rawRetentionDays: config.rawRetentionDays,
      kAnonymity: cat.kAnonymity,
      autoReplayTarget: config.autoReplayTarget,
      ingestion: Object.fromEntries(ENVS.map((e) => [e, config.ingestSecrets[e] !== null])),
      adapters: adapterStatus(adapters),
      catalogues: {
        eventSchema: cat.eventSchema,
        features: cat.features.version,
        funnels: cat.funnels.version,
        segments: cat.segments.version,
      },
    };
  });

  app.get('/v1/routes', guarded, async (req) => ({
    env: assertEnv(req.query.env),
    routes: await knownRoutes(db, req.query.env),
  }));

  /** Explicit side-by-side comparison of one route in several environments. */
  app.get('/v1/compare/latency', guarded, async (req) => {
    const envs = String(req.query.envs ?? '').split(',');
    envs.forEach(assertEnv);
    if (new Set(envs).size !== envs.length || envs.length < 2) {
      throw new AppError('compare_needs_distinct_envs', 400);
    }
    if (typeof req.query.route !== 'string') throw new AppError('invalid_route', 400);
    const days = Math.min(Math.max(Number.parseInt(req.query.days, 10) || 14, 1), 90);
    const from = new Date(clock.now().getTime() - days * 86400000).toISOString().slice(0, 10);
    return {
      route: req.query.route,
      days,
      series: await compareRoute(db, envs, req.query.route, from),
    };
  });
}
