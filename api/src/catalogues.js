/**
 * Catalogues are code, not data: an unknown feature or event type is rejected at ingestion.
 * The integrator aligns FEATURES with Orqea's real feature keys (see docs/INTEGRATION.md).
 * Bump a catalogue's version whenever its content changes.
 */

export const EVENT_SCHEMA_VERSION = 1;

export const SOURCES = Object.freeze(['landing', 'app', 'backend', 'auth']);

export const EVENT_TYPES = Object.freeze([
  'page_view',
  'click',
  'signup',
  'login',
  'login_failed',
  'logout',
  'feature_use',
  'api_request',
  'client_error',
  'server_error',
  'paywall_hit',
  'upgrade',
]);

export const ERROR_TYPES = Object.freeze(['client_error', 'server_error']);

export const PLANS = Object.freeze(['free', 'pro', 'team', 'enterprise']);
export const DEVICES = Object.freeze(['desktop', 'mobile', 'tablet']);
export const THEMES = Object.freeze(['dark', 'light']);
export const CONSENTS = Object.freeze(['essential', 'analytics']);

export const FEATURES = Object.freeze({
  version: 1,
  items: Object.freeze([
    'board.create',
    'board.share',
    'list.create',
    'card.create',
    'card.move',
    'card.bulk',
    'card.comment',
    'rules.edit',
    'agent.run',
    'forms.create',
    'qr.create',
    'import.trello',
    'calendar.view',
    'billing.upgrade',
    'search.global',
    'cicd.connect',
    'members.invite',
    'export.csv',
  ]),
});

export const FUNNELS = Object.freeze({
  version: 1,
  items: Object.freeze([
    {
      key: 'activation',
      steps: [
        { key: 'landing', match: { type: 'page_view', source: 'landing' } },
        { key: 'signup_start', match: { type: 'page_view', page: '/signup' } },
        { key: 'signup_done', match: { type: 'signup' } },
        { key: 'first_board', match: { type: 'feature_use', feature: 'board.create' } },
        { key: 'first_card', match: { type: 'feature_use', feature: 'card.create' } },
        { key: 'day7_return', match: { type: 'login' }, minDaysAfterStart: 7 },
      ],
    },
    {
      key: 'upgrade',
      steps: [
        { key: 'paywall_hit', match: { type: 'paywall_hit' } },
        { key: 'upgrade', match: { type: 'upgrade' } },
      ],
    },
  ]),
});

export const SEAT_BUCKETS = Object.freeze(['1', '2-10', '11-50', '51+']);
export const TENURES = Object.freeze(['new', 'established', 'veteran']);
export const ACTIVITY_LEVELS = Object.freeze(['new', 'occasional', 'regular', 'power']);

export function seatBucket(seats) {
  if (seats === null || seats === undefined) return null;
  if (seats <= 1) return '1';
  if (seats <= 10) return '2-10';
  if (seats <= 50) return '11-50';
  return '51+';
}

export function tenure(ageDays) {
  if (ageDays === null || ageDays === undefined) return null;
  if (ageDays < 30) return 'new';
  if (ageDays < 365) return 'established';
  return 'veteran';
}

/** Activity level from the account age and the number of distinct active days in 28 days. */
export function activityLevel(ageDays, activeDays) {
  if (ageDays !== null && ageDays < 14) return 'new';
  if (activeDays < 4) return 'occasional';
  if (activeDays < 12) return 'regular';
  return 'power';
}

export const SEGMENTS = Object.freeze({
  version: 1,
  dimensions: Object.freeze({
    plan: PLANS,
    seats: SEAT_BUCKETS,
    tenure: TENURES,
    activity: ACTIVITY_LEVELS,
  }),
  rules: Object.freeze({
    seats: '1 | 2-10 | 11-50 | 51+ from account.seats',
    tenure: 'new < 30 days <= established < 365 days <= veteran, from account.ageDays',
    activity:
      'new if account younger than 14 days; else distinct active days in the last 28: ' +
      'occasional < 4 <= regular < 12 <= power',
  }),
});

/** k-anonymity threshold: no group smaller than this is ever returned by an insight query. */
export const K_ANONYMITY = 10;

export function catalogues() {
  return {
    eventSchema: EVENT_SCHEMA_VERSION,
    sources: SOURCES,
    types: EVENT_TYPES,
    features: FEATURES,
    funnels: FUNNELS,
    segments: SEGMENTS,
    kAnonymity: K_ANONYMITY,
  };
}
