import { expect, test } from 'vitest';
import {
  errorSignals,
  funnelSignals,
  latencySignals,
  quickExitSignals,
  rageSignals,
  seriesToLatency,
} from '../src/modules/incidents/detect.js';

const opts = { source: 'events', minSamples: 30 };

test('latency regression needs ratio, absolute delta and minimum samples', () => {
  const baseline = [
    { route: '/a', p95: 200, n: 100 },
    { route: '/b', p95: 200, n: 100 },
    { route: '/c', p95: 200, n: 10 },
    { route: '/d', p95: 100, n: 100 },
    { route: '/z', p95: 0, n: 100 },
    { route: '/m', p95: 200, n: 100 },
    { route: '/h', p95: 200, n: 100 },
  ];
  const current = [
    { route: '/a', p95: 700, n: 40 }, // ratio 3.5 → high
    { route: '/b', p95: 700, n: 20 }, // too few current samples
    { route: '/c', p95: 700, n: 40 }, // too few baseline samples
    { route: '/d', p95: 190, n: 40 }, // ratio 1.9 but delta 90 ms
    { route: '/z', p95: 190, n: 40 }, // zero baseline
    { route: '/new', p95: 900, n: 40 }, // no baseline
    { route: '/m', p95: 450, n: 40 }, // ratio 2.25 → medium
    { route: '/h', p95: 320, n: 40 }, // ratio 1.6 → low
  ];
  const signals = latencySignals(current, baseline, opts);
  expect(signals.map((s) => [s.route, s.severity])).toEqual([
    ['/a', 'high'],
    ['/m', 'medium'],
    ['/h', 'low'],
  ]);
  expect(signals[0].numbers).toEqual({
    currentP95Ms: 700,
    baselineP95Ms: 200,
    ratio: 3.5,
    samples: 40,
    baselineSamples: 100,
    thresholds: { minSamples: 30, minRatio: 1.5, minDeltaMs: 100 },
  });
  expect(latencySignals([{ route: '/h', p95: 290, n: 40 }], baseline, opts)).toEqual([]);
});

test('metric series are averaged per route', () => {
  expect(
    seriesToLatency([
      { route: '/a', valueMs: 100 },
      { route: '/a', valueMs: 300 },
      { route: '/b', valueMs: 50 },
    ]),
  ).toEqual([
    { route: '/a', p95: 200, n: 2 },
    { route: '/b', p95: 50, n: 1 },
  ]);
});

test('error spikes compare against the baseline scaled to the window', () => {
  const spans = { source: 'events', windowMs: 3600000, baselineMs: 7 * 24 * 3600000 };
  const signals = errorSignals(
    [
      { fingerprint: 'A', route: '/r', count: 12 }, // no baseline → ratio 12 → high
      { fingerprint: 'B', count: 9 }, // under min count
      { fingerprint: 'C', count: 20 }, // baseline 1680/week = 10/h → ratio 2
      { fingerprint: 'D', page: '/p', count: 30 }, // baseline 840/week = 5/h → ratio 6 → medium
      { fingerprint: 'E', count: 40 }, // baseline 1680 → ratio 4 → low
      { fingerprint: 'F', count: 150 }, // count ≥ 100 → high
    ],
    [
      { fingerprint: 'C', count: 1680 },
      { fingerprint: 'D', count: 840 },
      { fingerprint: 'E', count: 1680 },
      { fingerprint: 'F', count: 5040 },
    ],
    spans,
  );
  expect(signals.map((s) => [s.fingerprint, s.severity, s.route, s.page])).toEqual([
    ['A', 'high', '/r', null],
    ['D', 'medium', null, '/p'],
    ['E', 'low', null, null],
    ['F', 'high', null, null],
  ]);
  expect(signals[1].numbers).toEqual({
    count: 30,
    expectedCount: 5,
    ratio: 6,
    thresholds: { minCount: 10, minRatio: 3 },
  });
});

test('funnel drops need entrants and both absolute and relative drops', () => {
  const s = (step, entrants, converted) => ({ funnel: 'f', step, entrants, converted });
  const baseline = [
    s('a', 100, 60),
    s('b', 100, 60),
    s('c', 10, 6),
    s('d', 100, 0),
    s('e', 100, 50),
    s('g', 100, 20),
  ];
  const current = [
    s('a', 50, 10), // 0.6 → 0.2: high
    s('b', 20, 2), // too few entrants
    s('c', 50, 5), // baseline too small
    s('d', 50, 0), // baseline conversion 0
    s('e', 50, 18), // 0.5 → 0.36: -0.14 abs, 28% rel → low
    s('g', 50, 5), // 0.2 → 0.1: abs 0.1, rel 50% → high
    s('x', 50, 1), // no baseline
  ];
  const signals = funnelSignals(current, baseline);
  expect(signals.map((x) => [x.step, x.severity])).toEqual([
    ['a', 'high'],
    ['e', 'low'],
    ['g', 'high'],
  ]);
  expect(signals[0].numbers).toMatchObject({
    conversion: 0.2,
    baselineConversion: 0.6,
    entrants: 50,
  });
  expect(funnelSignals([s('m', 100, 45)], [s('m', 100, 60)])).toEqual([]);
  expect(funnelSignals([s('m', 100, 36)], [s('m', 100, 60)])[0].severity).toBe('medium');
});

test('rage clicks and quick exits', () => {
  expect(
    rageSignals([
      { page: '/p', element: 'a', sessions: 4 },
      { page: '/p', element: 'b', sessions: 5 },
      { page: '/p', element: 'c', sessions: 20 },
      { page: '/p', element: 'd', sessions: 50 },
    ]).map((r) => [r.element, r.severity]),
  ).toEqual([
    ['b', 'low'],
    ['c', 'medium'],
    ['d', 'high'],
  ]);
  const exits = quickExitSignals([
    { fingerprint: 'A', route: '/r', page: null, error_sessions: 10, exits: 4 },
    { fingerprint: 'B', route: null, page: '/p', error_sessions: 20, exits: 9 },
    { fingerprint: 'C', route: '/r', page: null, error_sessions: 10, exits: 8 },
  ]);
  expect(exits).toHaveLength(1);
  expect(exits[0]).toMatchObject({
    kind: 'quick_exit',
    fingerprint: 'C',
    severity: 'low',
    numbers: { errorSessions: 10, exits: 8, exitShare: 0.8 },
  });
});
