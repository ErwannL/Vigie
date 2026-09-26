import { PLANTED, createWorld, existingAccount, newVisitor } from './generate.js';

const MIN = 60000;

function plantedContext(world, minutesAgo, overrides = {}) {
  const { rng } = world;
  return {
    t: world.now - minutesAgo * MIN,
    visitor: rng.id('v'),
    session: rng.id('s'),
    user: rng.id('u'),
    consent: 'analytics',
    account: {
      plan: rng.chance(0.85) ? 'free' : 'pro',
      seats: 1,
      ageDays: rng.int(30, 400),
    },
    context: {
      country: 'FR',
      locale: 'fr',
      device: rng.chance(0.8) ? 'mobile' : 'desktop',
      theme: 'dark',
    },
    ...overrides,
  };
}

/** Planted slowness: the board route became slow with the new version, mostly on mobile. */
export function plantSlowRoute(world, sessions = 70) {
  for (let i = 0; i < sessions; i += 1) {
    const ctx = plantedContext(world, world.rng.int(20, 55));
    world.emit(ctx, 'page_view', 'app', { target: { page: '/boards' } });
    world.emit(ctx, 'page_view', 'app', { target: { page: PLANTED.ragePage } });
    world.emit(ctx, 'api_request', 'backend', {
      perf: { route: PLANTED.slowRoute, durationMs: world.rng.duration(1900), status: 200 },
    });
  }
}

/** Planted error spike on card moves, most sessions leaving right after the error. */
export function plantErrorSpike(world, sessions = 45) {
  for (let i = 0; i < sessions; i += 1) {
    const ctx = plantedContext(world, world.rng.int(15, 50));
    world.emit(ctx, 'page_view', 'app', { target: { page: '/board/:boardId' } });
    world.emit(ctx, 'feature_use', 'app', {
      target: { page: '/board/:boardId', feature: 'card.move' },
    });
    world.emit(ctx, 'server_error', 'backend', {
      perf: { route: PLANTED.errorRoute, status: 500 },
      target: { feature: 'card.move' },
      error: { kind: 'TypeError', fingerprint: PLANTED.errorFingerprint, message: 'card is null' },
    });
    if (world.rng.chance(0.3)) {
      ctx.t += 90000;
      world.emit(ctx, 'page_view', 'app', { target: { page: '/boards' } });
    }
  }
}

/** Planted rage clicks: 5 clicks within seconds on the same save button. */
export function plantRageClicks(world, sessions = 8) {
  for (let i = 0; i < sessions; i += 1) {
    const ctx = plantedContext(world, world.rng.int(10, 40));
    const start = ctx.t;
    for (let c = 0; c < 5; c += 1) {
      ctx.t = start + c * 800;
      world.emit(ctx, 'click', 'app', {
        target: { page: PLANTED.ragePage, element: PLANTED.rageElement },
      });
    }
  }
}

/** Normal traffic: new visitors over 34 days plus existing accounts. */
export function normalTraffic(world, { visitors, recentVisitors }) {
  const { rng } = world;
  const newcomers = Math.round(visitors * 0.55);
  for (let i = 0; i < newcomers; i += 1) {
    newVisitor(world, world.now - rng.int(26 * 60, 34 * 24 * 60) * MIN, false);
  }
  for (let i = 0; i < recentVisitors; i += 1) {
    newVisitor(world, world.now - rng.int(2 * 60, 23 * 60) * MIN, true);
  }
  for (let i = 0; i < visitors - newcomers; i += 1) existingAccount(world);
}

/**
 * The whole demo dataset: prod has every planted problem; recette is healthy and smaller
 * (for the prod vs recette comparison); dev only has essential-consent events.
 */
export function generateDemo(now, { scale = 1 } = {}) {
  const prod = createWorld('prod', 42, now);
  normalTraffic(prod, {
    visitors: Math.round(3000 * scale),
    recentVisitors: Math.round(250 * scale),
  });
  plantSlowRoute(prod);
  plantErrorSpike(prod);
  plantRageClicks(prod);
  const recette = createWorld('recette', 7, now);
  normalTraffic(recette, { visitors: Math.round(300 * scale), recentVisitors: 0 });
  const dev = createWorld('dev', 3, now);
  normalTraffic(dev, { visitors: Math.round(80 * scale), recentVisitors: 0 });
  return { prod: prod.events, recette: recette.events, dev: dev.events };
}
