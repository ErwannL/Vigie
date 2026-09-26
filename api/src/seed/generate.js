import { createRandom } from './random.js';

const MIN = 60000;
const DAY = 86400000;

/** What the demo plants, so the dashboard and both modules have something to find. */
export const PLANTED = Object.freeze({
  slowRoute: '/api/boards/:boardId',
  errorFingerprint: 'TypeError:card-move-null',
  errorRoute: '/api/cards/:cardId/move',
  funnelStep: 'signup_done',
  rageElement: 'card.save',
  ragePage: '/board/:boardId',
  newVersion: '2.4.0',
});

const ROUTE_MEDIANS = {
  '/api/boards': 90,
  '/api/boards/:boardId': 160,
  '/api/cards': 110,
  '/api/cards/:cardId/move': 120,
  '/api/search': 260,
  '/api/rules/:ruleId': 140,
  '/api/agents/:agentId/run': 900,
  '/api/forms': 130,
  '/api/lists': 80,
};

const FEATURE_ROUTES = {
  'board.create': '/api/boards',
  'card.create': '/api/cards',
  'card.move': '/api/cards/:cardId/move',
  'search.global': '/api/search',
  'rules.edit': '/api/rules/:ruleId',
  'agent.run': '/api/agents/:agentId/run',
  'forms.create': '/api/forms',
  'list.create': '/api/lists',
};

const BASE_FEATURES = {
  'card.create': 0.7,
  'card.move': 0.6,
  'list.create': 0.3,
  'card.comment': 0.3,
  'search.global': 0.25,
  'board.create': 0.12,
  'calendar.view': 0.15,
  'board.share': 0.08,
  'forms.create': 0.05,
  'card.bulk': 0.04,
  'export.csv': 0.03,
  'qr.create': 0.004,
};
const PLAN_FEATURES = {
  free: {},
  pro: { 'rules.edit': 0.2, 'agent.run': 0.05 },
  team: { 'rules.edit': 0.25, 'agent.run': 0.2, 'members.invite': 0.1 },
  enterprise: { 'rules.edit': 0.3, 'agent.run': 0.25, 'members.invite': 0.1, 'cicd.connect': 0.05 },
};
const SEATS = { free: [1, 1], pro: [1, 5], team: [3, 40], enterprise: [30, 400] };

function appVersion(world, t) {
  if (t >= world.now - 60 * MIN) return PLANTED.newVersion;
  return t >= world.now - 14 * DAY ? '2.3.1' : '2.3.0';
}

/** Creates the per-environment generation state and the `emit` helper. */
export function createWorld(env, seed, now) {
  const rng = createRandom(seed);
  const world = { env, rng, now: now.getTime(), events: [] };
  world.emit = (ctx, type, source, extra = {}) => {
    const event = {
      schema: 1,
      env,
      eventId: rng.uuid(),
      occurredAt: new Date(ctx.t).toISOString(),
      source,
      type,
      visitor: ctx.visitor,
      session: ctx.session,
      user: ctx.user,
      context: { ...ctx.context, appVersion: appVersion(world, ctx.t) },
      consent: ctx.consent,
      ...extra,
    };
    if (ctx.account) event.account = { ...ctx.account };
    world.events.push(event);
    ctx.t += rng.int(3, 40) * 1000;
    return event;
  };
  return world;
}

function newContext(world, t, overrides = {}) {
  const { rng } = world;
  return {
    t,
    visitor: rng.id('v'),
    session: rng.id('s'),
    user: null,
    account: null,
    consent: world.env === 'dev' ? 'essential' : rng.chance(0.6) ? 'analytics' : 'essential',
    context: {
      country: rng.weighted({ FR: 6, BE: 1, CH: 1, CA: 1, US: 1 }),
      locale: rng.weighted({ fr: 7, en: 3 }),
      device: rng.weighted({ desktop: 6, mobile: 3, tablet: 1 }),
      theme: rng.weighted({ dark: 6, light: 4 }),
    },
    ...overrides,
  };
}

function apiCall(world, ctx, route, feature = null) {
  const perf = { route, durationMs: world.rng.duration(ROUTE_MEDIANS[route]), status: 200 };
  return world.emit(ctx, 'api_request', 'backend', feature ? { perf, target: { feature } } : { perf });
}

function useFeature(world, ctx, feature, page = '/board/:boardId') {
  world.emit(ctx, 'feature_use', 'app', { target: { page, feature } });
  if (FEATURE_ROUTES[feature]) apiCall(world, ctx, FEATURE_ROUTES[feature], feature);
  if (feature === 'card.move' && world.rng.chance(0.003)) {
    world.emit(ctx, 'server_error', 'backend', {
      perf: { route: PLANTED.errorRoute, status: 500 },
      target: { feature },
      error: { kind: 'TypeError', fingerprint: PLANTED.errorFingerprint, message: 'card is null' },
    });
  }
}

function paywall(world, ctx) {
  world.emit(ctx, 'paywall_hit', 'app', { target: { page: '/board/:boardId', feature: 'rules.edit' } });
  if (world.rng.chance(0.2)) {
    world.emit(ctx, 'page_view', 'app', { target: { page: '/settings/billing' } });
    world.emit(ctx, 'upgrade', 'app', { target: { page: '/settings/billing', feature: 'billing.upgrade' } });
    ctx.account.plan = 'pro';
  }
}

/** One signed-in session in the app: boards, a board, some features, maybe a paywall. */
export function appSession(world, ctx) {
  const { rng } = world;
  world.emit(ctx, 'page_view', 'app', { target: { page: '/boards' } });
  apiCall(world, ctx, '/api/boards');
  world.emit(ctx, 'page_view', 'app', { target: { page: '/board/:boardId' } });
  apiCall(world, ctx, '/api/boards/:boardId');
  const plan = ctx.account.plan;
  const odds = { ...BASE_FEATURES, ...PLAN_FEATURES[plan] };
  for (const [feature, p] of Object.entries(odds)) if (rng.chance(p)) useFeature(world, ctx, feature);
  if (plan === 'free' && rng.chance(0.1)) paywall(world, ctx);
  if (rng.chance(0.02)) {
    const fingerprint = rng.pick(['ChunkLoadError:app', 'TypeError:calendar-render']);
    world.emit(ctx, 'client_error', 'app', {
      target: { page: '/board/:boardId' },
      error: { kind: fingerprint.split(':')[0], fingerprint, message: 'render failed' },
    });
  }
  if (rng.chance(0.3)) world.emit(ctx, 'logout', 'auth', { target: { page: '/boards' } });
}

function landingVisit(world, ctx) {
  world.emit(ctx, 'page_view', 'landing', { target: { page: '/' } });
  const { rng } = world;
  if (rng.chance(0.5)) world.emit(ctx, 'click', 'landing', { target: { page: '/', element: 'landing.hero.cta' } });
  if (rng.chance(0.2)) world.emit(ctx, 'click', 'landing', { target: { page: '/', element: 'landing.pricing.toggle' } });
  if (rng.chance(0.1)) world.emit(ctx, 'click', 'landing', { target: { page: '/', element: 'landing.features.tab' } });
}

/** A first-time visitor: landing, maybe signup, first board, first card, day-7 return. */
export function newVisitor(world, t, recent) {
  const { rng } = world;
  const ctx = newContext(world, t);
  landingVisit(world, ctx);
  if (!rng.chance(0.55)) return;
  world.emit(ctx, 'page_view', 'auth', { target: { page: '/signup' } });
  if (!rng.chance(recent ? 0.15 : 0.6)) return;
  ctx.user = rng.id('u');
  ctx.account = { plan: 'free', seats: 1, ageDays: 0 };
  world.emit(ctx, 'signup', 'auth', { target: { page: '/signup' } });
  if (!rng.chance(0.7)) return;
  world.emit(ctx, 'page_view', 'app', { target: { page: '/boards' } });
  useFeature(world, ctx, 'board.create', '/boards');
  if (rng.chance(0.8)) useFeature(world, ctx, 'card.create');
  const back = t + rng.int(7, 10) * DAY;
  if (rng.chance(0.35) && back < world.now - 2 * 60 * MIN) {
    Object.assign(ctx, { t: back, session: rng.id('s') });
    ctx.account.ageDays = 8;
    world.emit(ctx, 'login', 'auth', { target: { page: '/login' } });
    appSession(world, ctx);
  }
}

/** An existing account with an activity level, coming back over the last 28 days. */
export function existingAccount(world) {
  const { rng } = world;
  const plan = rng.weighted({ free: 55, pro: 25, team: 15, enterprise: 5 });
  const activity = rng.weighted({ occasional: 4, regular: 4, power: 2 });
  const sessions = { occasional: 2, regular: 7, power: 20 }[activity];
  const ctx = newContext(world, 0, { user: rng.id('u') });
  ctx.account = { plan, seats: rng.int(...SEATS[plan]), ageDays: rng.chance(0.1) ? rng.int(1, 13) : rng.int(30, 900) };
  for (let i = 0; i < sessions; i += 1) {
    Object.assign(ctx, { t: world.now - rng.int(2 * 60, 28 * 24 * 60) * MIN, session: rng.id('s') });
    if (rng.chance(0.3)) {
      landingVisit(world, ctx);
      world.emit(ctx, 'click', 'landing', { target: { page: '/', element: 'landing.nav.login' } });
    }
    if (rng.chance(0.05)) world.emit(ctx, 'login_failed', 'auth', { target: { page: '/login' } });
    world.emit(ctx, 'login', 'auth', { target: { page: '/login' } });
    appSession(world, ctx);
  }
}
