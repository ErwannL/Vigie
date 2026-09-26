import { afterAll, expect, test } from 'vitest';
import { validateEvent } from '../src/collector/validate.js';
import { PLANTED } from '../src/seed/generate.js';
import { generateDemo } from '../src/seed/plants.js';
import { createRandom } from '../src/seed/random.js';
import { seedDemo } from '../src/seed/demo.js';
import { NOW } from './factories.js';
import { fixedClock, testContainer, testDb } from './helpers.js';

afterAll(async () => (await testDb()).close());

test('the random helpers are deterministic', () => {
  const a = createRandom(1);
  const b = createRandom(1);
  expect([a.next(), a.int(1, 6), a.uuid(), a.id('u')]).toEqual([
    b.next(),
    b.int(1, 6),
    b.uuid(),
    b.id('u'),
  ]);
  expect(a.weighted({ x: 0, y: 0 })).toBe('y');
  expect(a.weighted({ only: 1 })).toBe('only');
  expect(a.pick(['k'])).toBe('k');
  expect(typeof a.chance(0.5)).toBe('boolean');
  expect(a.duration(100)).toBeGreaterThanOrEqual(5);
});

test('every generated demo event is valid and none targets another environment', () => {
  const data = generateDemo(NOW, { scale: 0.05 });
  for (const env of ['dev', 'recette', 'prod']) {
    expect(data[env].length).toBeGreaterThan(100);
    for (const event of data[env]) {
      const result = validateEvent(event, { env, now: NOW, retentionDays: 60 });
      expect(result.ok ? 'ok' : result.code).toBe('ok');
    }
  }
  expect(data.dev.every((e) => e.consent === 'essential')).toBe(true);
  expect(data.prod.some((e) => e.consent === 'analytics')).toBe(true);
  expect(data.prod.some((e) => e.error?.fingerprint === PLANTED.errorFingerprint)).toBe(true);
});

test('the full demo plants a slow route, an error spike, rage clicks and a funnel drop in prod only', async () => {
  const c = await testContainer({ clock: fixedClock(NOW.toISOString()) });
  const summary = await seedDemo(c);
  expect(summary.prod.rejected).toBe(0);
  expect(summary.prod.accepted).toBeGreaterThan(100000);
  expect(summary.recette.incidents).toBe(0);
  expect(summary.dev.incidents).toBe(0);
  const keys = (await c.services.incidents.list('prod')).map((i) => i.key).sort();
  expect(keys).toEqual([
    'element:/board/:boardId#card.save',
    'funnel:activation/signup_done',
    `route:${PLANTED.slowRoute}`,
    `route:${PLANTED.errorRoute}`,
  ]);
  const slow = (await c.services.incidents.list('prod')).find(
    (i) => i.key === `route:${PLANTED.slowRoute}`,
  );
  expect(slow.sinceVersion).toBe(PLANTED.newVersion);
  expect(slow.segments.device[0].value).toBe('mobile');
  const visitors = await c.db.query(
    "SELECT count(DISTINCT visitor) AS n FROM events WHERE env = 'prod'",
  );
  expect(visitors.rows[0].n).toBeGreaterThan(1000);
}, 120000);
