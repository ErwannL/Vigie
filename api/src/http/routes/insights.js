import { assertEnv } from '../../env.js';

/** Module 2 operator routes. Every insight is computed for exactly one environment. */
export function registerInsightRoutes(app, deps) {
  const { services, repos } = deps;
  const guarded = { preHandler: app.requireSession };
  const insights = services.insights;

  app.get('/v1/insights/usage', guarded, async (req) =>
    insights.usage(req.query.env, req.query.days),
  );
  app.get('/v1/insights/landing', guarded, async (req) =>
    insights.landing(req.query.env, req.query.days),
  );
  app.get('/v1/insights/funnels', guarded, async (req) =>
    insights.funnels(req.query.env, req.query.days, req.query.by),
  );
  app.get('/v1/insights/segments', guarded, async (req) =>
    insights.segments(req.query.env, req.query.days),
  );
  app.get('/v1/insights/errors', guarded, async (req) =>
    insights.errors(req.query.env, req.query.days),
  );

  app.post('/v1/personas/preview', guarded, async (req) =>
    insights.previewPersonas(req.body?.sourceEnv, req.body?.targetEnv, req.body?.days),
  );
  app.post('/v1/personas/push', guarded, async (req) =>
    insights.pushPersonas(req.body?.sourceEnv, req.body?.targetEnv, req.body?.days, req.operator),
  );
  app.get('/v1/personas', guarded, async (req) => ({
    env: assertEnv(req.query.env),
    sets: await repos.personaSets.list(req.query.env),
  }));
}
