import { createHmac, randomUUID } from 'node:crypto';
import { safeEqual } from './ingest.js';

/**
 * Vigie's own operator session: a short-lived bearer token `<payload>.<hmac>` signed with
 * VIGIE_SESSION_SECRET. Stateless; it carries the operator id and display name for auditing.
 */
export function issueSession({ sub, name }, secret, now, ttlSeconds) {
  const exp = Math.floor(now.getTime() / 1000) + ttlSeconds;
  const payload = Buffer.from(JSON.stringify({ sub, name, exp, sid: randomUUID() })).toString(
    'base64url',
  );
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return { token: `${payload}.${signature}`, expiresAt: new Date(exp * 1000).toISOString() };
}

/** Returns `{ sub, name }` for a valid, unexpired token, else null. */
export function readSession(token, secret, now) {
  if (typeof token !== 'string') return null;
  const [payload, signature, extra] = token.split('.');
  if (extra !== undefined || !payload || !signature) return null;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  if (!safeEqual(signature, expected)) return null;
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (data.exp <= Math.floor(now.getTime() / 1000)) return null;
  return { sub: data.sub, name: data.name };
}
