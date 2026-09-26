import { expect, test } from 'vitest';
import {
  correlate,
  filterForKey,
  incidentTitle,
  maxSeverity,
  signalKey,
} from '../src/modules/incidents/correlate.js';
import {
  assertTransition,
  canTransition,
  statusAfterReplay,
  withHistory,
} from '../src/modules/incidents/lifecycle.js';
import { summarizeProfile } from '../src/modules/incidents/profile.js';
import { issuePayload } from '../src/modules/incidents/report.js';
import { filterSql } from '../src/modules/incidents/queries.js';

test('signal keys prefer route, then fingerprint, then element, then funnel step', () => {
  expect(signalKey({ route: '/r', fingerprint: 'F' })).toBe('route:/r');
  expect(signalKey({ fingerprint: 'F', page: '/p' })).toBe('error:F');
  expect(signalKey({ page: '/p', element: 'e' })).toBe('element:/p#e');
  expect(signalKey({ funnel: 'f', step: 's' })).toBe('funnel:f/s');
});

test('keys map back to event filters', () => {
  expect(filterForKey('route:/api/a:b')).toEqual({ route: '/api/a:b' });
  expect(filterForKey('error:TypeError:x')).toEqual({ fingerprint: 'TypeError:x' });
  expect(filterForKey('element:/p/:id#a.b')).toEqual({ page: '/p/:id', element: 'a.b' });
  expect(filterForKey('funnel:f/s')).toBeNull();
  expect(filterSql({ route: '/r' }, 4)).toEqual({ sql: 'route = $4', params: ['/r'] });
  expect(filterSql({ fingerprint: 'F' }, 2)).toEqual({
    sql: 'error_fingerprint = $2',
    params: ['F'],
  });
  expect(filterSql({ page: '/p', element: 'e' }, 4)).toEqual({
    sql: 'page = $4 AND element = $5',
    params: ['/p', 'e'],
  });
});

test('correlation groups signals by key and keeps the worst severity', () => {
  const candidates = correlate([
    { kind: 'latency', route: '/r', severity: 'low' },
    { kind: 'error_spike', route: '/r', fingerprint: 'F', page: '/p', severity: 'high' },
    { kind: 'latency', route: '/r', severity: 'medium' },
    { kind: 'funnel_drop', funnel: 'f', step: 's', severity: 'medium' },
  ]);
  expect(candidates).toHaveLength(2);
  expect(candidates[0]).toMatchObject({
    key: 'route:/r',
    severity: 'high',
    kinds: ['error_spike', 'latency'],
    routes: ['/r'],
    pages: ['/p'],
    fingerprints: ['F'],
  });
  expect(candidates[0].signals).toHaveLength(3);
  expect(maxSeverity('low', 'high')).toBe('high');
  expect(maxSeverity('high', 'low')).toBe('high');
  expect(incidentTitle(candidates[0])).toBe('Error spike on + Slow /r');
  expect(
    incidentTitle({ key: 'element:/p#e', kinds: ['rage_click', 'quick_exit', 'funnel_drop'] }),
  ).toBe('Rage clicks on + Quick exits after error on + Funnel drop at /p#e');
});

test('lifecycle transitions', () => {
  expect(canTransition('open', 'reproducing')).toBe(true);
  expect(canTransition('resolved', 'reopened')).toBe(true);
  expect(canTransition('resolved', 'open')).toBe(false);
  expect(() => assertTransition('open', 'confirmed')).toThrow('invalid_transition');
  expect(() => assertTransition('confirmed', 'resolved')).not.toThrow();
  expect(statusAfterReplay('reproduced', 'open')).toBe('confirmed');
  expect(statusAfterReplay('not_reproduced', 'open')).toBe('not_reproduced');
  expect(statusAfterReplay('failed', 'reopened')).toBe('reopened');
});

test('history keeps the last 50 entries', () => {
  let h = [];
  for (let i = 0; i < 55; i += 1) h = withHistory(h, new Date(0), `e${i}`, { i });
  expect(h).toHaveLength(50);
  expect(h[0]).toEqual({ at: '1970-01-01T00:00:00.000Z', event: 'e5', i: 5 });
  expect(withHistory([], new Date(0), 'x')).toEqual([
    { at: '1970-01-01T00:00:00.000Z', event: 'x' },
  ]);
});

test('profile summary: segment shares, features, current and "since" versions', () => {
  const rows = [
    { dim: 'device', value: 'mobile', n: 8 },
    { dim: 'device', value: 'desktop', n: 2 },
    { dim: 'device', value: null, n: 5 },
    { dim: 'plan', value: 'free', n: 3 },
    { dim: 'plan', value: 'pro', n: 3 },
    { dim: 'feature', value: 'card.move', n: 9 },
    { dim: 'feature', value: 'qr.create', n: 0.5 },
    { dim: 'app_version', value: '2.3.1', n: 5, first_at: '2026-09-01T10:00:00Z' },
    { dim: 'app_version', value: '2.4.0', n: 5, first_at: '2026-09-01T11:00:00Z' },
    { dim: 'app_version', value: null, n: 1, first_at: '2026-09-01T09:00:00Z' },
  ];
  expect(summarizeProfile(rows, ['2.3.1'])).toEqual({
    segments: {
      device: [
        { value: 'mobile', share: 0.8 },
        { value: 'desktop', share: 0.2 },
      ],
      plan: [
        { value: 'free', share: 0.5 },
        { value: 'pro', share: 0.5 },
      ],
    },
    features: ['card.move'],
    appVersion: '2.4.0',
    sinceVersion: '2.4.0',
  });
  expect(summarizeProfile(rows, []).sinceVersion).toBeNull();
  expect(summarizeProfile(rows, ['2.3.1', '2.4.0']).sinceVersion).toBeNull();
  expect(summarizeProfile([], [])).toEqual({
    segments: { device: [], plan: [] },
    features: [],
    appVersion: null,
    sinceVersion: null,
  });
});

const incident = {
  id: 7,
  env: 'prod',
  title: 'Slow /r',
  severity: 'high',
  status: 'confirmed',
  routes: ['/r'],
  pages: [],
  features: ['card.move'],
  fingerprints: [],
  segments: { device: [{ value: 'mobile', share: 0.8 }], plan: [] },
  firstSeen: '2026-09-01T10:00:00Z',
  lastSeen: new Date('2026-09-01T11:00:00Z'),
  appVersion: '2.4.0',
  sinceVersion: '2.4.0',
  triggers: [{ kind: 'latency' }],
  replay: { targetEnv: 'recette', state: 'reproduced', evidence: { steps: 2 } },
};

test('issue payload is structured and has no user identities', () => {
  const payload = issuePayload(incident, 'https://vigie.test');
  expect(payload).toMatchObject({
    schema: 1,
    source: 'vigie',
    incidentId: 7,
    env: 'prod',
    affected: { routes: ['/r'], features: ['card.move'], errorFingerprints: [] },
    firstSeen: '2026-09-01T10:00:00.000Z',
    lastSeen: '2026-09-01T11:00:00.000Z',
    reproduction: { targetEnv: 'recette', state: 'reproduced', evidence: { steps: 2 } },
    evidenceLinks: ['https://vigie.test/#/incidents/7?env=prod'],
  });
  const text = JSON.stringify(payload);
  expect(text).not.toMatch(/user|visitor|session/);
  const bare = issuePayload({ ...incident, replay: { targetEnv: 'dev', state: 'queued' } }, null);
  expect(bare.evidenceLinks).toEqual([]);
  expect(bare.reproduction.evidence).toBeNull();
  expect(issuePayload({ ...incident, replay: null }, null).reproduction).toBeNull();
});
