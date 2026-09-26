import { expect, test } from 'vitest';
import { FUNNELS } from '../src/catalogues.js';
import { errorsView } from '../src/modules/insights/errors.js';
import {
  conversions,
  funnelView,
  groupSubjects,
  reachedSteps,
  stepCounts,
} from '../src/modules/insights/funnels.js';
import { mask, safeRate } from '../src/modules/insights/kanon.js';
import { landingView } from '../src/modules/insights/landing.js';
import { derivePersonaSet } from '../src/modules/insights/personas.js';
import { segmentsView } from '../src/modules/insights/segments.js';
import { outcomeView, usageView } from '../src/modules/insights/usage.js';

const [activation, upgrade] = FUNNELS.items;

test('k-anonymity masks every count below 10', () => {
  expect(mask(9)).toEqual({ value: null, masked: true });
  expect(mask(10)).toEqual({ value: 10, masked: false });
  expect(mask(0)).toEqual({ value: null, masked: true });
  expect(safeRate(3, 9)).toBeNull();
  expect(safeRate(3, 10)).toBe(0.3);
});

const at = (day, hour = 0) => new Date(Date.UTC(2026, 7, day, hour)).toISOString();
const e = (type, day, extra = {}) => ({
  type,
  occurred_at: at(day),
  source: 'app',
  page: null,
  feature: null,
  plan: null,
  device: null,
  ...extra,
});
const landing = (day) => e('page_view', day, { source: 'landing', page: '/' });

test('funnel steps must happen in order; day-7 return needs 7 days after the start', () => {
  const full = [
    landing(1),
    e('page_view', 1, { source: 'auth', page: '/signup' }),
    e('signup', 1),
    e('feature_use', 1, { feature: 'board.create' }),
    e('feature_use', 1, { feature: 'card.create' }),
    e('login', 5),
    e('login', 8),
    e('login', 9),
  ];
  expect(reachedSteps(activation, full)).toBe(6);
  expect(reachedSteps(activation, full.slice(0, 6))).toBe(5);
  const outOfOrder = [e('signup', 1), landing(2)];
  expect(reachedSteps(activation, outOfOrder)).toBe(1);
  expect(reachedSteps(upgrade, [e('upgrade', 1), e('paywall_hit', 2)])).toBe(1);
  expect(
    stepCounts(upgrade, [[e('paywall_hit', 1), e('upgrade', 1)], [e('paywall_hit', 1)], []]),
  ).toEqual([2, 1]);
});

test('funnel view masks small steps and computes conversion and drop-off', () => {
  const subjects = [
    ...Array.from({ length: 20 }, () => [e('paywall_hit', 1), e('upgrade', 1)]),
    ...Array.from({ length: 30 }, () => [e('paywall_hit', 1)]),
  ];
  expect(funnelView(upgrade, subjects)).toEqual([
    { key: 'paywall_hit', count: { value: 50, masked: false }, conversion: null, dropOff: null },
    { key: 'upgrade', count: { value: 20, masked: false }, conversion: 0.4, dropOff: 0.6 },
  ]);
  expect(funnelView(upgrade, subjects.slice(0, 5))[1]).toEqual({
    key: 'upgrade',
    count: { value: null, masked: true },
    conversion: null,
    dropOff: null,
  });
});

test('subjects are grouped by their last known attribute value', () => {
  const groups = groupSubjects(
    [
      [e('x', 1, { plan: 'free' }), e('y', 2, { plan: 'pro' })],
      [e('x', 1)],
      [e('x', 1, { plan: 'free' })],
    ],
    'plan',
  );
  expect([...groups.keys()]).toEqual(['pro', 'unknown', 'free']);
  expect(groups.get('pro')).toHaveLength(1);
});

test('conversions for detection skip time-gated steps', () => {
  const list = conversions([[landing(1), e('page_view', 1, { source: 'auth', page: '/signup' })]]);
  expect(list.map((c) => `${c.funnel}/${c.step}`)).toEqual([
    'activation/signup_start',
    'activation/signup_done',
    'activation/first_board',
    'activation/first_card',
    'upgrade/upgrade',
  ]);
  expect(list[0]).toEqual({
    funnel: 'activation',
    step: 'signup_start',
    entrants: 1,
    converted: 1,
  });
});

const USAGE_INPUT = {
  counts: [
    { feature: 'card.create', uses: 500, users: 100, dau: 40, wau: 80, prev_wau: 50 },
    { feature: 'qr.create', uses: 3, users: 2, dau: 1, wau: 2, prev_wau: 0 },
    { feature: 'card.bulk', uses: 30, users: 12, dau: 1, wau: 12, prev_wau: 12 },
  ],
  active: 400,
  byPlan: [
    { feature: 'card.create', plan: 'free', users: 60 },
    { feature: 'card.create', plan: 'team', users: 4 },
  ],
  outcomes: [
    {
      feature: 'card.create',
      users_with: 100,
      early_with: 50,
      retained_with: 40,
      upgraded_with: 10,
      users_without: 300,
      early_without: 100,
      retained_without: 50,
      upgraded_without: 3,
    },
  ],
  daily: [
    { day: '2026-08-31', feature: 'card.create', users: 30 },
    { day: '2026-09-01', feature: 'card.create', users: 5 },
  ],
};

test('usage view: masking, never-used and rarely-used features, outcomes and series', () => {
  const view = usageView(USAGE_INPUT);
  const card = view.features.find((f) => f.feature === 'card.create');
  expect(card).toMatchObject({
    uses: 500,
    users: { value: 100, masked: false },
    trend: 0.6,
    shareOfActive: 0.25,
    byPlan: [
      { plan: 'free', users: { value: 60, masked: false } },
      { plan: 'team', users: { value: null, masked: true } },
    ],
    outcomes: {
      retentionWith: 0.8,
      retentionWithout: 0.5,
      retentionLift: 0.3,
      upgradeWith: 0.1,
      upgradeWithout: 0.01,
      upgradeLift: 0.09,
    },
    series: [
      { day: '2026-08-31', users: 30 },
      { day: '2026-09-01', users: null },
    ],
  });
  const qr = view.features.find((f) => f.feature === 'qr.create');
  expect(qr).toMatchObject({ users: { value: null, masked: true }, trend: null, outcomes: null });
  expect(view.neverUsed).toContain('import.trello');
  expect(view.neverUsed).not.toContain('card.create');
  expect(view.rarelyUsed).toEqual(['card.bulk', 'qr.create']);
  expect(view.activeUsers).toEqual({ value: 400, masked: false });
  expect(
    outcomeView({
      users_with: 5,
      early_with: 5,
      retained_with: 5,
      upgraded_with: 1,
      users_without: 5,
      early_without: 5,
      retained_without: 1,
      upgraded_without: 0,
    }),
  ).toEqual({
    retentionWith: null,
    retentionWithout: null,
    retentionLift: null,
    upgradeWith: null,
    upgradeWithout: null,
    upgradeLift: null,
  });
  const quiet = usageView({
    counts: [{ feature: 'card.move', uses: 1, users: 20, dau: 0, wau: 0, prev_wau: 0 }],
    active: 5,
    byPlan: [],
    outcomes: [],
    daily: [],
  });
  expect(quiet.rarelyUsed).toEqual([]);
});

test('landing view splits new visitors from returning accounts, masked', () => {
  const view = landingView({
    counts: { views: 300, visitors: 200 },
    clicks: [
      { element: 'landing.hero.cta', clicks: 120, visitors: 100 },
      { element: 'landing.rare', clicks: 3, visitors: 3 },
    ],
    conversions: [{ kind: 'new', visitors: 150, signups: 30, logins: 0 }],
  });
  expect(view).toEqual({
    views: 300,
    visitors: { value: 200, masked: false },
    clicks: [
      {
        element: 'landing.hero.cta',
        clicks: 120,
        visitors: { value: 100, masked: false },
        clickRate: 0.5,
      },
      {
        element: 'landing.rare',
        clicks: 3,
        visitors: { value: null, masked: true },
        clickRate: 0.015,
      },
    ],
    conversion: {
      new: { visitors: { value: 150, masked: false }, signupRate: 0.2, loginRate: 0 },
      returning: { visitors: { value: null, masked: true }, signupRate: null, loginRate: null },
    },
  });
});

test('segments view buckets accounts and masks small segments', () => {
  const rows = [
    ...Array.from({ length: 12 }, () => ({
      plan: 'free',
      seats: 1,
      age_days: 100,
      active_days: 2,
    })),
    ...Array.from({ length: 3 }, () => ({
      plan: 'team',
      seats: 20,
      age_days: 400,
      active_days: 15,
    })),
    ...Array.from({ length: 3 }, () => ({
      plan: 'pro',
      seats: 20,
      age_days: 400,
      active_days: 15,
    })),
    { plan: null, seats: null, age_days: null, active_days: 1 },
  ];
  const view = segmentsView(rows);
  expect(view.accounts).toEqual({ value: 19, masked: false });
  expect(view.segments).toEqual([
    {
      plan: 'free',
      seats: '1',
      tenure: 'established',
      activity: 'occasional',
      accounts: { value: 12, masked: false },
    },
    {
      plan: 'pro',
      seats: '11-50',
      tenure: 'veteran',
      activity: 'power',
      accounts: { value: null, masked: true },
    },
    {
      plan: 'team',
      seats: '11-50',
      tenure: 'veteran',
      activity: 'power',
      accounts: { value: null, masked: true },
    },
    {
      plan: 'unknown',
      seats: 'unknown',
      tenure: 'unknown',
      activity: 'occasional',
      accounts: { value: null, masked: true },
    },
  ]);
  expect(view.byDimension.plan).toEqual([
    { value: 'free', accounts: { value: 12, masked: false } },
    { value: 'pro', accounts: { value: null, masked: true } },
    { value: 'team', accounts: { value: null, masked: true } },
    { value: 'unknown', accounts: { value: null, masked: true } },
  ]);
  expect(view.byDimension.activity[0]).toEqual({
    value: 'occasional',
    accounts: { value: 13, masked: false },
  });
  expect(segmentsView([]).accounts.masked).toBe(true);
});

test('errors view masks groups seen in fewer than 10 sessions', () => {
  expect(
    errorsView([
      { dimension: 'plan', value: 'pro', sessions: 50, error_sessions: 5, errors: 7 },
      { dimension: 'plan', value: 'free', sessions: 5, error_sessions: 5, errors: 9 },
      { dimension: 'device', value: 'mobile', sessions: 20, error_sessions: 2, errors: 2 },
    ]),
  ).toEqual({
    plan: [
      {
        value: 'free',
        sessions: { value: null, masked: true },
        errors: null,
        errorSessionRate: null,
      },
      { value: 'pro', sessions: { value: 50, masked: false }, errors: 7, errorSessionRate: 0.1 },
    ],
    device: [
      { value: 'mobile', sessions: { value: 20, masked: false }, errors: 2, errorSessionRate: 0.1 },
    ],
  });
});

const PERSONA_GROUPS = [
  {
    plan: 'free',
    device: 'mobile',
    locale: 'fr',
    sessions: 40,
    users: 12,
    median_events: 9.5,
    median_minutes: 4.25,
  },
  {
    plan: 'pro',
    device: 'desktop',
    locale: null,
    sessions: 30,
    users: 12,
    median_events: 3,
    median_minutes: 1,
  },
  {
    plan: 'team',
    device: 'tablet',
    locale: 'en',
    sessions: 5,
    users: 4,
    median_events: 1,
    median_minutes: 1,
  },
];

const PERSONA_FEATURES = [
  { plan: 'free', device: 'mobile', feature: 'card.move', sessions: 10 },
  { plan: 'free', device: 'mobile', feature: 'card.create', sessions: 30 },
  { plan: 'free', device: 'mobile', feature: 'board.create', sessions: 10 },
  { plan: 'team', device: 'tablet', feature: 'agent.run', sessions: 5 },
];

test('persona sets: one persona per group of at least k people, with weights and samples', () => {
  const window = { from: 'a', to: 'b', days: 28 };
  const subjects = [
    ...Array.from({ length: 10 }, () => [
      e('paywall_hit', 1, { plan: 'free', device: 'mobile' }),
      e('upgrade', 1, { plan: 'free', device: 'mobile' }),
    ]),
    [e('page_view', 1, { source: 'landing', page: '/' })],
  ];
  const set = derivePersonaSet({
    sourceEnv: 'prod',
    targetEnv: 'recette',
    window,
    groups: PERSONA_GROUPS,
    features: PERSONA_FEATURES,
    subjects,
  });
  expect(set).toMatchObject({
    schema: 1,
    kind: 'vigie.persona_set',
    sourceEnv: 'prod',
    targetEnv: 'recette',
    window,
  });
  expect(set.personas.map((p) => p.name)).toEqual(['free-mobile', 'pro-desktop']);
  expect(set.personas[0]).toEqual({
    name: 'free-mobile',
    traits: { plan: 'free', device: 'mobile', locale: 'fr' },
    weights: {
      features: { 'card.create': 0.75, 'board.create': 0.25, 'card.move': 0.25 },
      sessionLength: { medianEvents: 9.5, medianMinutes: 4.25 },
      dropOff: {
        activation: {
          signup_start: null,
          signup_done: null,
          first_board: null,
          first_card: null,
          day7_return: null,
        },
        upgrade: { upgrade: 0 },
      },
    },
    sample: { people: 12, sessions: 40, window },
  });
  expect(set.personas[1].traits.locale).toBe('en');
  expect(set.personas[1].weights.dropOff.upgrade.upgrade).toBeNull();
  expect(() =>
    derivePersonaSet({
      sourceEnv: 'prod',
      targetEnv: 'prod',
      window,
      groups: [],
      features: [],
      subjects: [],
    }),
  ).toThrow('figura_target_forbidden');
});
