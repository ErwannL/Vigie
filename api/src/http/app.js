import Fastify, { LogController } from 'fastify';
import { AppError } from '../errors.js';
import { readSession } from '../auth/session.js';
import { bearerToken } from '../auth/ingest.js';
import { registerPublicRoutes } from './routes/public.js';
import { registerIncidentRoutes } from './routes/incidents.js';
import { registerInsightRoutes } from './routes/insights.js';
import { registerSettingsRoutes } from './routes/settings.js';

/** Maps any thrown error to `{ error: code }`. Raw messages never reach clients. */
export function errorResponse(err) {
  if (err instanceof AppError) return { status: err.statusCode, code: err.code };
  if (err.code === 'FST_ERR_CTP_BODY_TOO_LARGE') return { status: 413, code: 'payload_too_large' };
  if (err.statusCode === 400) return { status: 400, code: 'invalid_request' };
  if (err.statusCode === 415) return { status: 415, code: 'unsupported_media_type' };
  return { status: 500, code: 'internal_error' };
}

function securityHeaders(config) {
  return {
    'content-security-policy': `default-src 'none'; frame-ancestors ${config.allowedFrameAncestors}`,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cache-control': 'no-store',
  };
}

/**
 * Logger settings: requests are logged by route template (never the raw URL, which may carry
 * ids), no header or body is ever serialised, and per-request traces are at debug level.
 */
export function loggerOptions(level, stream = undefined) {
  return {
    level,
    stream,
    serializers: {
      req: (req) => ({ method: req.method, route: req.routeOptions?.url ?? 'unknown' }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  };
}

/** Builds the Fastify app with every dependency injected. Does not listen. */
export function buildApp(deps) {
  const { config, clock } = deps;
  const app = Fastify({
    logger: deps.logger,
    // Fastify's own per-request lines are off; ours (below) are at debug level.
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 64 * 1024,
  });
  app.addHook('onResponse', async (req, reply) => {
    req.log.debug({ req, res: reply, ms: Math.round(reply.elapsedTime) }, 'request');
  });
  app.addHook('onRequest', async (_req, reply) => {
    reply.headers(securityHeaders(config));
  });
  app.setErrorHandler((err, req, reply) => {
    const { status, code } = errorResponse(err);
    if (status >= 500) req.log.error({ code, err: err.code ?? err.name }, 'request failed');
    reply.code(status).send({ error: code });
  });
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'not_found' }));

  /** preHandler for operator routes: requires Vigie's own session bearer. */
  app.decorate('requireSession', async (req) => {
    if (config.sessionSecret === null) throw new AppError('session_not_configured', 503);
    const operator = readSession(
      bearerToken(req.headers.authorization),
      config.sessionSecret,
      clock.now(),
    );
    if (operator === null) throw new AppError('unauthorized', 401);
    req.operator = operator;
  });

  registerPublicRoutes(app, deps);
  registerSettingsRoutes(app, deps);
  registerIncidentRoutes(app, deps);
  registerInsightRoutes(app, deps);
  return app;
}
