import { afterAll, beforeAll, expect, test } from 'vitest';
import { rollup } from '../src/jobs/rollup.js';
import { createWorld } from '../src/seed/generate.js';
import { normalTraffic } from '../src/seed/plants.js';
import { NOW, ingest } from './factories.js';
import { fixedClock, makeEvent, testContainer, testDb } from './helpers.js';

let c;
beforeAll(async () => {
  c = await testContainer({ clock: fixedClock(NOW.toISOString()) });
  const world = createWorld('prod', 11, NOW);
  normalTraffic(world, { visitors: 700, recentVisitors: 40 });
  await ingest(c, 'prod', world.events);
  await ingest(c, 'dev', [
    makeEvent({
      env: 'dev',
      consent: 'essential',
      type: 'client_error',
      error: { kind: 'E', fingerprint: 'E:1' },
    }),
  ]);
  await rollup(c.db, 'prod', '2026-07-01', '2026-09-01');
});
afterAll(async () => (await testDb()).close());

const people = (obj) =>
  JSON.stringify(obj).match(
    /"(users|visitors|accounts|sessions|dau|wau|count|activeUsers)":\{"value":(\d+)/g,
  ) ?? [];

function assertKAnonymous(result) {
  for (const hit of people(result)) {
    const n = Number(hit.split(':').at(-1));
    expect(n).toBeGreaterThanOrEqual(10);
  }
}

test('every insight requires an environment', async () => {
  const i = c.services.insights;
  for (const call of [i.usage, i.landing, i.segments, i.errors]) {
    await expect(call(undefined, 28)).rejects.toThrow('invalid_env');
  }
  await expect(i.funnels('all', 28)).rejects.toThrow('invalid_env');
  await expect(i.previewPersonas('prod', 'prod', 28)).rejects.toThrow('figura_target_forbidden');
});

test('without analytics consent data, behavioural insights say so instead of showing charts', async () => {
  const i = c.services.insights;
  for (const result of [
    await i.usage('dev'),
    await i.landing('dev'),
    await i.funnels('dev'),
    await i.segments('dev'),
  ]) {
    expect(result.analytics).toEqual({ events: 0, hasData: false });
    expect(Object.keys(result).sort()).toEqual(['analytics', 'env', 'window']);
  }
  expect((await i.previewPersonas('dev', 'recette')).set).toBeNull();
  expect(await i.pushPersonas('dev', 'recette', 28, { sub: 'op' })).toMatchObject({
    pushed: false,
  });
  const errors = await i.errors('dev');
  expect(errors.analytics.hasData).toBe(false);
  expect(errors.plan).toEqual([
    { value: 'pro', sessions: { value: null, masked: true }, errors: null, errorSessionRate: null },
  ]);
});

test('usage: features, never-used ones, k-anonymous counts, window clamping', async () => {
  const usage = await c.services.insights.usage('prod', '500');
  expect(usage.window).toEqual({
    from: '2026-06-03T12:00:00.000Z',
    to: NOW.toISOString(),
    days: 90,
  });
  expect((await c.services.insights.usage('prod', 'abc')).window.days).toBe(28);
  expect(usage.analytics.hasData).toBe(true);
  expect(usage.neverUsed).toContain('import.trello');
  expect(usage.rarelyUsed).toContain('qr.create');
  const card = usage.features.find((f) => f.feature === 'card.create');
  expect(card.users.masked).toBe(false);
  expect(card.series.length).toBeGreaterThan(20);
  expect(card.outcomes).not.toBeNull();
  assertKAnonymous(usage);
});

test('landing, funnels, segments and errors are aggregated and k-anonymous', async () => {
  const i = c.services.insights;
  const landing = await i.landing('prod', 28);
  expect(landing.views).toBeGreaterThan(100);
  expect(landing.clicks.map((x) => x.element)).toContain('landing.hero.cta');
  expect(landing.conversion.new.signupRate).toBeGreaterThan(0);
  assertKAnonymous(landing);
  const funnels = await i.funnels('prod', 28, 'device');
  expect(funnels.by).toBe('device');
  expect(funnels.funnels[0].steps[0].count.value).toBeGreaterThan(50);
  expect(funnels.funnels[0].groups.map((g) => g.value)).toEqual(['desktop', 'mobile', 'tablet']);
  assertKAnonymous(funnels);
  expect((await i.funnels('prod', 28, 'email')).by).toBeNull();
  const segments = await i.segments('prod', 28);
  expect(segments.byDimension.plan.map((p) => p.value)).toContain('free');
  assertKAnonymous(segments);
  const errors = await i.errors('prod', 28);
  expect(errors.device.map((d) => d.value)).toEqual(['desktop', 'mobile', 'tablet']);
  assertKAnonymous(errors);
  expect(JSON.stringify([landing, funnels, segments, errors])).not.toMatch(
    /user_|visitor_|"v_|"u_|"s_/,
  );
});

test('personas: preview from prod, push to recette, history stored with both environments', async () => {
  const i = c.services.insights;
  const preview = await i.previewPersonas('prod', 'recette', 28);
  expect(preview.set.sourceEnv).toBe('prod');
  expect(preview.set.targetEnv).toBe('recette');
  expect(preview.set.personas.length).toBeGreaterThan(1);
  for (const p of preview.set.personas) expect(p.sample.people).toBeGreaterThanOrEqual(10);
  const pushed = await i.pushPersonas('prod', 'dev', 28, { sub: 'op-1', name: 'Ada' });
  expect(pushed).toMatchObject({ pushed: true, id: 1, accepted: preview.set.personas.length });
  const fake = c.adapters.figuraSlots.dev.impl;
  expect(fake.personaSets[0].targetEnv).toBe('dev');
  const [saved] = await c.repos.personaSets.list('prod');
  expect(saved).toMatchObject({ env: 'prod', target_env: 'dev' });
  await expect(i.pushPersonas('prod', 'prod', 28, { sub: 'op' })).rejects.toThrow(
    'figura_target_forbidden',
  );
  await ingest(c, 'recette', [makeEvent({ env: 'recette' })]);
  const tiny = await i.pushPersonas('recette', 'dev', 28, { sub: 'op' });
  expect(tiny).toMatchObject({ pushed: false, set: { personas: [] } });
});
