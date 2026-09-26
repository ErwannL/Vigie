import { createHmac } from 'node:crypto';
import { AppError } from '../errors.js';
import { safeEqual } from './ingest.js';

const MAX_LIFETIME_SECONDS = 60;
const CLOCK_SKEW_SECONDS = 5;

function decodePart(part) {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
  } catch {
    throw new AppError('sso_malformed', 401);
  }
}

export function signHs256(claims, secret, header = { alg: 'HS256', typ: 'JWT' }) {
  const body = [header, claims]
    .map((p) => Buffer.from(JSON.stringify(p)).toString('base64url'))
    .join('.');
  const signature = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

const nonEmptyString = (v) => typeof v === 'string' && v !== '';

function checkClaims(claims, nowSeconds, issuer) {
  const fail = (code) => {
    throw new AppError(code, 401);
  };
  if (claims.iss !== issuer) fail('sso_bad_issuer');
  if (claims.aud !== 'vigie') fail('sso_bad_audience');
  if (!nonEmptyString(claims.sub) && !nonEmptyString(claims.operator)) fail('sso_missing_claim');
  if (!nonEmptyString(claims.jti)) fail('sso_missing_claim');
  if (!Number.isInteger(claims.iat) || !Number.isInteger(claims.exp)) fail('sso_missing_claim');
  if (claims.exp - claims.iat > MAX_LIFETIME_SECONDS) fail('sso_lifetime_too_long');
  if (claims.iat > nowSeconds + CLOCK_SKEW_SECONDS) fail('sso_not_yet_valid');
  if (claims.exp <= nowSeconds - CLOCK_SKEW_SECONDS) fail('sso_expired');
}

/**
 * Verifies the admin console's 60-second HS256 handoff token. Throws AppError(401).
 * `issuer` is VIGIE_SSO_ISSUER (Orqea's handoff factory signs `orqea-admin-console`).
 * The subject is `sub`, or Orqea's `operator` claim when `sub` is absent; `name` defaults to
 * the subject. Returns the claims with `sub` and `name` normalised.
 */
export function verifySsoToken(token, secret, now, issuer) {
  const parts = typeof token === 'string' ? token.split('.') : [];
  if (parts.length !== 3) throw new AppError('sso_malformed', 401);
  const header = decodePart(parts[0]);
  if (header.alg !== 'HS256') throw new AppError('sso_bad_algorithm', 401);
  const expected = createHmac('sha256', secret)
    .update(`${parts[0]}.${parts[1]}`)
    .digest('base64url');
  if (!safeEqual(parts[2], expected)) throw new AppError('sso_bad_signature', 401);
  const claims = decodePart(parts[1]);
  checkClaims(claims, Math.floor(now.getTime() / 1000), issuer);
  const sub = nonEmptyString(claims.sub) ? claims.sub : claims.operator;
  return { ...claims, sub, name: nonEmptyString(claims.name) ? claims.name : sub };
}
