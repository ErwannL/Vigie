import { createHmac } from 'node:crypto';
import { expect, test } from 'vitest';
import { bearerToken, envForIngestToken, safeEqual } from '../src/auth/ingest.js';
import { signHs256, verifySsoToken } from '../src/auth/jwt.js';
import { issueSession, readSession } from '../src/auth/session.js';

const secrets = { dev: 'd'.repeat(32), recette: null, prod: 'p'.repeat(32) };

test('bearer parsing', () => {
  expect(bearerToken('Bearer abc')).toBe('abc');
  expect(bearerToken('Basic abc')).toBeNull();
  expect(bearerToken('Bearer a b')).toBeNull();
  expect(bearerToken(undefined)).toBeNull();
});

test('the matched ingestion secret decides the environment', () => {
  expect(envForIngestToken(`Bearer ${'p'.repeat(32)}`, secrets)).toBe('prod');
  expect(envForIngestToken(`Bearer ${'d'.repeat(32)}`, secrets)).toBe('dev');
  expect(envForIngestToken(`Bearer ${'q'.repeat(32)}`, secrets)).toBeNull();
  expect(envForIngestToken(undefined, secrets)).toBeNull();
});

test('an absent (short) secret never matches, even an identical short bearer', () => {
  const s = { dev: null, recette: null, prod: null };
  expect(envForIngestToken('Bearer short', s)).toBeNull();
});

test('safeEqual compares strings of different lengths without throwing', () => {
  expect(safeEqual('a', 'a')).toBe(true);
  expect(safeEqual('a', 'ab')).toBe(false);
});

const SSO = 's'.repeat(40);
const now = new Date('2026-09-01T12:00:00Z');
const t = Math.floor(now.getTime() / 1000);
const claims = (over = {}) => ({
  iss: 'orqea-admin-console',
  aud: 'vigie',
  sub: 'op-1',
  name: 'Ada',
  iat: t,
  exp: t + 60,
  jti: 'j-1',
  ...over,
});

const ISSUER = 'orqea-admin-console';
const verify = (token) => verifySsoToken(token, SSO, now, ISSUER);

test('a valid 60-second handoff token is verified', () => {
  expect(verify(signHs256(claims(), SSO))).toMatchObject({ sub: 'op-1', name: 'Ada', jti: 'j-1' });
});

test("Orqea's handoff shape: `operator` stands in for `sub`, `name` defaults to the subject", () => {
  const orqea = claims({ sub: undefined, name: undefined, operator: 'admin@orqea' });
  expect(verify(signHs256(orqea, SSO))).toMatchObject({ sub: 'admin@orqea', name: 'admin@orqea' });
  // `sub` wins over `operator` when both are present.
  expect(verify(signHs256(claims({ operator: 'other' }), SSO)).sub).toBe('op-1');
  // The issuer is a setting: the same token fails under another expected issuer.
  expect(() => verifySsoToken(signHs256(claims(), SSO), SSO, now, 'orqea')).toThrow(
    'sso_bad_issuer',
  );
});

test.each([
  ['wrong issuer', claims({ iss: 'evil' }), 'sso_bad_issuer'],
  ['wrong audience', claims({ aud: 'figura' }), 'sso_bad_audience'],
  ['missing sub and operator', claims({ sub: '' }), 'sso_missing_claim'],
  ['empty operator, no sub', claims({ sub: undefined, operator: '' }), 'sso_missing_claim'],
  ['missing jti', claims({ jti: undefined }), 'sso_missing_claim'],
  ['non-integer iat', claims({ iat: 'now' }), 'sso_missing_claim'],
  ['non-integer exp', claims({ exp: 1.5 }), 'sso_missing_claim'],
  ['lifetime over 60 s', claims({ exp: t + 61 }), 'sso_lifetime_too_long'],
  ['issued in the future', claims({ iat: t + 30, exp: t + 60 }), 'sso_not_yet_valid'],
  ['expired', claims({ iat: t - 70, exp: t - 10 }), 'sso_expired'],
])('rejects a token with %s', (_l, c, code) => {
  expect(() => verify(signHs256(c, SSO))).toThrow(code);
});

test('rejects malformed tokens, other algorithms and bad signatures', () => {
  expect(() => verify(undefined)).toThrow('sso_malformed');
  expect(() => verify('a.b')).toThrow('sso_malformed');
  expect(() => verify('!!.e30.x')).toThrow('sso_malformed');
  expect(() => verify(signHs256(claims(), SSO, { alg: 'none' }))).toThrow('sso_bad_algorithm');
  expect(() => verify(signHs256(claims(), 'o'.repeat(40)))).toThrow('sso_bad_signature');
  const header = Buffer.from('{"alg":"HS256"}').toString('base64url');
  const body = 'bm90IGpzb24';
  const sig = createHmac('sha256', SSO).update(`${header}.${body}`).digest('base64url');
  expect(() => verify(`${header}.${body}.${sig}`)).toThrow('sso_malformed');
});

const SESSION = 'x'.repeat(40);

test('sessions round-trip and expire', () => {
  const { token, expiresAt } = issueSession({ sub: 'op-1', name: 'Ada' }, SESSION, now, 1800);
  expect(expiresAt).toBe('2026-09-01T12:30:00.000Z');
  expect(readSession(token, SESSION, now)).toEqual({ sub: 'op-1', name: 'Ada' });
  expect(readSession(token, SESSION, new Date('2026-09-01T12:30:00Z'))).toBeNull();
});

test('forged or malformed sessions are refused', () => {
  const { token } = issueSession({ sub: 'op-1', name: null }, SESSION, now, 60);
  expect(readSession(token, 'y'.repeat(40), now)).toBeNull();
  expect(readSession(`${token}.extra`, SESSION, now)).toBeNull();
  expect(readSession('only-one-part', SESSION, now)).toBeNull();
  expect(readSession('.sig', SESSION, now)).toBeNull();
  expect(readSession(null, SESSION, now)).toBeNull();
});
