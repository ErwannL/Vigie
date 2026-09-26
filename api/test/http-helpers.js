import { randomUUID } from 'node:crypto';
import { signHs256 } from '../src/auth/jwt.js';
import { buildApp, loggerOptions } from '../src/http/app.js';
import { NOW } from './factories.js';
import { SECRETS, fixedClock, logSink, testContainer } from './helpers.js';

export async function testApp({ vars = {}, clock = fixedClock(NOW.toISOString()) } = {}) {
  const sink = logSink();
  const container = await testContainer({ vars, clock, logStream: sink.stream });
  const app = buildApp({ ...container, logger: loggerOptions('debug', sink.stream) });
  return { app, container, sink, clock };
}

export function ssoToken(clock, over = {}) {
  const t = Math.floor(clock.now().getTime() / 1000);
  return signHs256(
    {
      iss: 'orqea',
      aud: 'vigie',
      sub: 'op-1',
      name: 'Ada Lovelace',
      iat: t,
      exp: t + 60,
      jti: randomUUID(),
      ...over,
    },
    SECRETS.sso,
  );
}

/** Goes through the real SSO handoff and returns an Authorization header. */
export async function login(app, clock) {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/sso',
    payload: { token: ssoToken(clock) },
  });
  return { authorization: `Bearer ${res.json().token}` };
}

export const ingestAuth = (env) => ({ authorization: `Bearer ${SECRETS[env]}` });
