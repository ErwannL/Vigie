import { expect, test } from 'vitest';
import { validateEvent } from '../src/collector/validate.js';
import { makeEvent } from './helpers.js';

const opts = { env: 'prod', now: new Date('2026-09-01T12:00:00Z'), retentionDays: 60 };
const check = (overrides) => validateEvent(makeEvent(overrides), opts);

test('a complete analytics event is accepted and flattened', () => {
  const result = check({ eventId: '3F2C1A4E-1B2C-4D5E-8F90-123456789ABC' });
  expect(result.ok).toBe(true);
  expect(result.row).toMatchObject({
    eventId: '3f2c1a4e-1b2c-4d5e-8f90-123456789abc',
    visitor: 'visitor_0001',
    user: 'user_000001',
    plan: 'pro',
    seats: 3,
    segment: 'smb',
    element: 'card.save',
    feature: 'card.create',
    route: '/api/cards',
    locale: 'fr',
    errorMessage: null,
  });
});

test('a minimal event (no optional sections) is accepted', () => {
  const e = makeEvent();
  for (const k of ['visitor', 'session', 'user', 'account', 'context', 'target', 'perf'])
    delete e[k];
  const result = validateEvent(e, opts);
  expect(result.ok).toBe(true);
  expect(result.row).toMatchObject({ visitor: null, session: null, plan: null, route: null });
});

test('essential consent drops visitor, user, element and behavioural fields', () => {
  const result = check({
    consent: 'essential',
    error: { kind: 'TypeError', fingerprint: 'TypeError:x', message: 'card is null' },
  });
  expect(result.ok).toBe(true);
  expect(result.row).toMatchObject({
    consent: 'essential',
    visitor: null,
    user: null,
    element: null,
    feature: null,
    seats: null,
    ageDays: null,
    segment: null,
    country: null,
    locale: null,
    theme: null,
    // kept: what incidents need
    session: 'session_0001',
    plan: 'pro',
    device: 'desktop',
    appVersion: '2.3.1',
    page: '/board/:boardId',
    route: '/api/cards',
    durationMs: 120,
    errorFingerprint: 'TypeError:x',
    errorMessage: 'card is null',
  });
});

test.each([
  ['not an object', null, 'invalid_event'],
  ['an array', [], 'invalid_event'],
])('rejects %s', (_l, value, code) => {
  expect(validateEvent(value, opts)).toEqual({ ok: false, code });
});

test.each([
  ['unknown top-level field (free text)', { cardTitle: 'My secret card' }, 'unknown_field'],
  ['schema', { schema: 2 }, 'unsupported_schema'],
  ['env claiming another environment', { env: 'dev' }, 'env_mismatch'],
  ['event id', { eventId: 'abc' }, 'invalid_event_id'],
  ['non-UTC date', { occurredAt: '2026-09-01T11:00:00+02:00' }, 'invalid_occurred_at'],
  ['impossible date', { occurredAt: '2026-02-31T99:00:00Z' }, 'invalid_occurred_at'],
  ['future date', { occurredAt: '2026-09-01T12:10:00Z' }, 'occurred_at_in_future'],
  ['too old', { occurredAt: '2026-06-01T12:00:00Z' }, 'occurred_at_too_old'],
  ['source', { source: 'mobile' }, 'invalid_source'],
  ['type', { type: 'card_title_changed' }, 'unknown_type'],
  ['consent', { consent: 'maybe' }, 'invalid_consent'],
  ['raw IP visitor', { visitor: '192.168.0.12' }, 'invalid_visitor'],
  ['session', { session: 'a b' }, 'invalid_session'],
  ['email as user', { user: 'jane@example.com' }, 'invalid_user'],
  ['account not object', { account: 'pro' }, 'invalid_account'],
  ['account extra field', { account: { plan: 'pro', email: 'x' } }, 'unknown_field_account'],
  ['plan', { account: { plan: 'gold' } }, 'invalid_plan'],
  ['seats', { account: { seats: 0 } }, 'invalid_seats'],
  ['age', { account: { ageDays: 1.5 } }, 'invalid_age_days'],
  ['segment', { account: { segment: 'Big Customers' } }, 'invalid_segment'],
  ['country', { context: { country: 'France' } }, 'invalid_country'],
  ['locale', { context: { locale: 'french' } }, 'invalid_locale'],
  ['device', { context: { device: 'tv' } }, 'invalid_device'],
  ['theme', { context: { theme: 'blue' } }, 'invalid_theme'],
  ['app version', { context: { appVersion: 'latest' } }, 'invalid_app_version'],
  ['input value in target', { target: { value: 'typed text' } }, 'unknown_field_target'],
  ['raw page URL', { target: { page: '/board/42' } }, 'page_not_template'],
  ['page with query', { target: { page: '/search?q=hello' } }, 'page_not_template'],
  ['button text as element', { target: { element: 'Save changes' } }, 'invalid_element'],
  ['unknown feature', { target: { feature: 'card.teleport' } }, 'unknown_feature'],
  ['duration', { perf: { durationMs: -1 } }, 'invalid_duration'],
  ['status', { perf: { status: 700 } }, 'invalid_status'],
  ['raw route', { perf: { route: '/api/boards/8f1e2d3c4b5a' } }, 'route_not_template'],
  ['error kind', { error: { kind: 'Type Error!' } }, 'invalid_error_kind'],
  ['error fingerprint', { error: { fingerprint: 'a b' } }, 'invalid_error_fingerprint'],
  ['error message too long', { error: { message: 'x'.repeat(301) } }, 'invalid_error_message'],
  ['error message not a string', { error: { message: 3 } }, 'invalid_error_message'],
  [
    'email in error message',
    { error: { message: 'no user jane@x.io' } },
    'unsanitised_error_message',
  ],
])('rejects bad %s', (_label, overrides, code) => {
  expect(check(overrides)).toEqual({ ok: false, code });
});
