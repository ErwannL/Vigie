import { createHash, timingSafeEqual } from 'node:crypto';
import { ENVS } from '../env.js';

function digest(value) {
  return createHash('sha256').update(value, 'utf8').digest();
}

/** Constant-time string comparison: both sides are hashed to equal-length buffers first. */
export function safeEqual(a, b) {
  return timingSafeEqual(digest(a), digest(b));
}

export function bearerToken(header) {
  if (typeof header !== 'string') return null;
  const match = /^Bearer ([^\s]+)$/.exec(header);
  return match ? match[1] : null;
}

/**
 * Returns the environment whose ingestion secret matches the bearer, or null.
 * Every configured secret is compared, so timing does not reveal which env matched.
 * Absent secrets (null, i.e. shorter than 32 characters) never match.
 */
export function envForIngestToken(header, secrets) {
  const token = bearerToken(header);
  if (token === null) return null;
  let found = null;
  for (const env of ENVS) {
    const secret = secrets[env];
    if (secret !== null && safeEqual(token, secret)) found = env;
  }
  return found;
}
