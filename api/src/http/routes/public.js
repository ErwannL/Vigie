import { envForIngestToken } from '../../auth/ingest.js';
import { verifySsoToken } from '../../auth/jwt.js';
import { issueSession } from '../../auth/session.js';
import { MAX_BATCH_BYTES } from '../../collector/ingest.js';
import { isOpaqueId } from '../../collector/sanitize.js';
import { AppError } from '../../errors.js';

/** Routes that do not need an operator session: health, SSO handoff, ingestion, GDPR. */
export function registerPublicRoutes(app, deps) {
  const { config, db, clock, collector, repos } = deps;

  const ingestEnv = (req) => {
    const env = envForIngestToken(req.headers.authorization, config.ingestSecrets);
    if (env === null) throw new AppError('unauthorized', 401);
    return env;
  };

  const subjectOf = (req) => {
    if (!isOpaqueId(req.params.user)) throw new AppError('invalid_user', 400);
    return req.params.user;
  };

  app.get('/healthz', async () => ({ status: 'ok' }));

  app.get('/readyz', async (_req, reply) => {
    try {
      await db.ping();
      return { status: 'ready' };
    } catch {
      return reply.code(503).send({ status: 'unavailable' });
    }
  });

  app.post('/auth/sso', async (req) => {
    if (config.ssoSecret === null || config.sessionSecret === null) {
      throw new AppError('sso_not_configured', 503);
    }
    const now = clock.now();
    const claims = verifySsoToken(req.body?.token, config.ssoSecret, now, config.ssoIssuer);
    if (!(await repos.jti.consume(claims.jti, new Date(claims.exp * 1000)))) {
      throw new AppError('sso_replayed', 401);
    }
    const { name } = claims;
    const session = issueSession(
      { sub: claims.sub, name },
      config.sessionSecret,
      now,
      config.sessionTtlSeconds,
    );
    await repos.audit.record({ operator: claims.sub, operatorName: name, action: 'sso.login' });
    return { ...session, operator: { sub: claims.sub, name } };
  });

  app.post('/v1/events', { bodyLimit: MAX_BATCH_BYTES }, async (req, reply) => {
    const env = ingestEnv(req);
    const result = await collector.ingest(env, req.body);
    req.log.debug({ env, accepted: result.accepted, rejected: result.rejected.length }, 'ingest');
    return reply.code(202).send(result);
  });

  app.get('/v1/subjects/:user', async (req) => {
    const env = ingestEnv(req);
    const user = subjectOf(req);
    return { env, user, events: await repos.events.forSubject(env, user) };
  });

  app.delete('/v1/subjects/:user', async (req) => {
    const env = ingestEnv(req);
    const user = subjectOf(req);
    return { env, user, deleted: await repos.events.deleteSubject(env, user) };
  });
}
