import { assertEnv } from '../../env.js';
import { AppError } from '../../errors.js';
import { STATUSES } from '../../modules/incidents/lifecycle.js';

function incidentId(req) {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id < 1 || String(id) !== req.params.id) {
    throw new AppError('invalid_incident_id', 400);
  }
  return id;
}

/** Module 1 operator routes. `env` is a required query parameter on every one of them. */
export function registerIncidentRoutes(app, deps) {
  const { services } = deps;
  const guarded = { preHandler: app.requireSession };

  app.get('/v1/incidents', guarded, async (req) => {
    const env = assertEnv(req.query.env);
    const status = req.query.status ?? null;
    if (status !== null && !STATUSES.includes(status)) throw new AppError('invalid_status', 400);
    return { env, incidents: await services.incidents.list(env, { status }) };
  });

  app.get('/v1/incidents/:id', guarded, async (req) => ({
    incident: await services.incidents.get(assertEnv(req.query.env), incidentId(req)),
  }));

  app.post('/v1/incidents/:id/replay', guarded, async (req) => ({
    incident: await services.incidents.requestReplay(
      assertEnv(req.query.env),
      incidentId(req),
      req.body?.targetEnv,
      req.operator,
    ),
  }));

  app.post('/v1/incidents/:id/resolve', guarded, async (req) => ({
    incident: await services.incidents.resolve(assertEnv(req.query.env), incidentId(req), req.operator),
  }));

  app.post('/v1/detect', guarded, async (req) =>
    services.incidents.runDetection(assertEnv(req.query.env)),
  );
}
