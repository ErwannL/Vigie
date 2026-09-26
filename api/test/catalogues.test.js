import { expect, test } from 'vitest';
import {
  FEATURES,
  FUNNELS,
  activityLevel,
  catalogues,
  seatBucket,
  tenure,
} from '../src/catalogues.js';

test('seat buckets', () => {
  expect([null, undefined, 1, 2, 10, 11, 50, 51].map(seatBucket)).toEqual([
    null,
    null,
    '1',
    '2-10',
    '2-10',
    '11-50',
    '11-50',
    '51+',
  ]);
});

test('tenure buckets', () => {
  expect([null, undefined, 0, 29, 30, 364, 365].map(tenure)).toEqual([
    null,
    null,
    'new',
    'new',
    'established',
    'established',
    'veteran',
  ]);
});

test('activity levels', () => {
  expect(activityLevel(5, 20)).toBe('new');
  expect(activityLevel(null, 3)).toBe('occasional');
  expect(activityLevel(100, 4)).toBe('regular');
  expect(activityLevel(100, 11)).toBe('regular');
  expect(activityLevel(100, 12)).toBe('power');
});

test('catalogues are versioned and exported together', () => {
  const c = catalogues();
  expect(c.eventSchema).toBe(1);
  expect(c.features.version).toBe(1);
  expect(c.features.items).toContain('card.bulk');
  expect(c.funnels.items.map((f) => f.key)).toEqual(['activation', 'upgrade']);
  expect(c.kAnonymity).toBe(10);
  expect(new Set(FEATURES.items).size).toBe(FEATURES.items.length);
  expect(FUNNELS.items[0].steps.map((s) => s.key)).toEqual([
    'landing',
    'signup_start',
    'signup_done',
    'first_board',
    'first_card',
    'day7_return',
  ]);
});
