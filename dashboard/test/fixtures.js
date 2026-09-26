const masked = { value: null, masked: true };
const n = (value) => ({ value, masked: false });
const meta = (env = 'prod', hasData = true) => ({
  env,
  window: { from: '2026-08-04T12:00:00.000Z', to: '2026-09-01T12:00:00.000Z', days: 28 },
  analytics: { events: hasData ? 1000 : 0, hasData },
});
export const noData = (env = 'dev') => meta(env, false);

export const settings = {
  mode: 'development',
  envs: ['dev', 'recette', 'prod'],
  figuraTargets: ['dev', 'recette'],
  rawRetentionDays: 60,
  kAnonymity: 10,
  autoReplayTarget: null,
  ingestion: { dev: false, recette: true, prod: true },
  adapters: {
    sources: {
      dev: { logs: 'fake', metrics: 'fake', errors: 'fake' },
      recette: { logs: 'not_configured', metrics: 'fake', errors: 'fake' },
      prod: { logs: 'configured', metrics: 'fake', errors: 'fake' },
    },
    figura: { dev: 'fake', recette: 'configured' },
    issues: 'fake',
  },
  catalogues: { eventSchema: 1, features: 1, funnels: 1, segments: 1 },
};

export const incident = {
  id: 1,
  env: 'prod',
  key: 'route:/api/boards/:boardId',
  status: 'open',
  severity: 'high',
  title: 'Slow /api/boards/:boardId',
  kinds: ['latency'],
  routes: ['/api/boards/:boardId'],
  pages: [],
  features: ['card.move'],
  fingerprints: [],
  segments: {
    device: [
      { value: 'mobile', share: 0.86 },
      { value: 'desktop', share: 0.14 },
    ],
    plan: [{ value: 'free', share: 0.84 }],
  },
  triggers: [
    {
      kind: 'latency',
      source: 'events',
      numbers: { currentP95Ms: 3763, baselineP95Ms: 340 },
      detectedAt: '2026-09-01T12:00:00.000Z',
    },
    {
      kind: 'log_evidence',
      source: 'logs',
      numbers: { lines: 20 },
      detectedAt: '2026-09-01T12:00:00.000Z',
    },
  ],
  appVersion: '2.4.0',
  sinceVersion: '2.4.0',
  firstSeen: '2026-09-01T11:00:00.000Z',
  lastSeen: '2026-09-01T12:00:00.000Z',
  replay: null,
  issueRef: 'FAKE-1',
  history: [{ at: '2026-09-01T12:00:00.000Z', event: 'opened' }],
};

export const funnelIncident = {
  ...incident,
  id: 2,
  key: 'funnel:activation/signup_done',
  severity: 'medium',
  kinds: ['funnel_drop'],
  routes: [],
  features: [],
  segments: { device: [], plan: [{ value: 'pro', share: 0.3 }] },
  appVersion: null,
  sinceVersion: null,
};

export const replayed = {
  ...incident,
  status: 'confirmed',
  replay: {
    runId: 'recette:fake-1',
    sourceEnv: 'prod',
    targetEnv: 'recette',
    state: 'reproduced',
    scenario: { schema: 1, steps: [{ action: 'visit', target: '/boards' }] },
    evidence: { runner: 'fake-figura' },
  },
};

export const feature = (name, over = {}) => ({
  feature: name,
  uses: 0,
  users: masked,
  dau: masked,
  wau: masked,
  trend: null,
  shareOfActive: null,
  byPlan: [],
  outcomes: null,
  series: [],
  ...over,
});

export const usage = {
  ...meta(),
  activeUsers: n(400),
  features: [
    feature('card.create', {
      uses: 500,
      users: n(100),
      dau: n(40),
      wau: n(80),
      trend: 0.6,
      shareOfActive: 0.25,
      outcomes: { retentionLift: 0.3, upgradeLift: -0.02 },
    }),
    feature('qr.create', { uses: 2 }),
    feature('import.trello'),
  ],
  neverUsed: ['import.trello'],
  rarelyUsed: [],
};

export const segments = {
  ...meta(),
  accounts: n(300),
  byDimension: {
    plan: [
      { value: 'free', accounts: n(200) },
      { value: 'enterprise', accounts: masked },
    ],
    seats: [{ value: '1', accounts: n(150) }],
    tenure: [{ value: 'new', accounts: n(30) }],
    activity: [{ value: 'power', accounts: n(12) }],
  },
  segments: [],
};

export const errors = {
  ...meta(),
  plan: [
    { value: 'free', sessions: n(120), errors: 14, errorSessionRate: 0.08 },
    { value: 'team', sessions: masked, errors: null, errorSessionRate: null },
  ],
  device: [{ value: 'mobile', sessions: n(60), errors: 9, errorSessionRate: 0.1 }],
};

const steps = [
  { key: 'paywall_hit', count: n(50), conversion: null, dropOff: null },
  { key: 'upgrade', count: n(20), conversion: 0.4, dropOff: 0.6 },
];
export const funnels = {
  ...meta(),
  by: null,
  funnels: [
    { key: 'upgrade', steps, groups: [] },
    {
      key: 'activation',
      steps: [{ key: 'landing', count: masked, conversion: null, dropOff: null }],
      groups: [{ value: 'mobile', steps }],
    },
  ],
};

export const landing = {
  ...meta(),
  views: 1234,
  visitors: n(800),
  clicks: [
    { element: 'landing.hero.cta', clicks: 300, visitors: n(250), clickRate: 0.312 },
    { element: 'landing.rare', clicks: 3, visitors: masked, clickRate: 0.004 },
  ],
  conversion: {
    new: { visitors: n(600), signupRate: 0.2, loginRate: 0 },
    returning: { visitors: masked, signupRate: null, loginRate: null },
  },
};

export const personaSet = {
  schema: 1,
  kind: 'vigie.persona_set',
  sourceEnv: 'prod',
  targetEnv: 'recette',
  window: meta().window,
  personas: [
    {
      name: 'free-mobile',
      traits: { plan: 'free', device: 'mobile', locale: 'fr' },
      weights: {
        features: { 'card.create': 0.75, 'card.move': 0.5 },
        sessionLength: { medianEvents: 9, medianMinutes: 4.5 },
        dropOff: {},
      },
      sample: { people: 120, sessions: 400, window: meta().window },
    },
  ],
};

export const personaHistory = {
  env: 'prod',
  sets: [
    {
      id: 1,
      env: 'prod',
      target_env: 'recette',
      payload: personaSet,
      accepted: 1,
      pushed_at: '2026-09-01T12:00:00.000Z',
    },
  ],
};

export const compare = {
  route: '/api/boards/:boardId',
  days: 14,
  series: {
    prod: [
      { day: '2026-08-31', requests: 100, errors: 0, p50_ms: 150, p95_ms: 340 },
      { day: '2026-09-01', requests: 100, errors: 1, p50_ms: 400, p95_ms: 2100 },
    ],
    recette: [{ day: '2026-09-01', requests: 10, errors: 0, p50_ms: 140, p95_ms: 330 }],
  },
};
