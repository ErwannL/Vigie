import { expect, test } from 'vitest';
import {
  MIN_PATH_SESSIONS,
  buildScenario,
  commonPath,
  validateScenario,
} from '../src/modules/incidents/scenario.js';

const trail = (session, steps) => steps.map((s) => ({ session, ...s }));
const visit = (page) => ({ type: 'page_view', page });
const use = (feature) => ({ type: 'feature_use', feature });

test('the common path needs at least MIN_PATH_SESSIONS sessions: one user trail is never used', () => {
  expect(MIN_PATH_SESSIONS).toBe(5);
  const rows = [
    ...trail('lonely', [visit('/boards'), visit('/secret-path')]),
    ...trail('s1', [visit('/boards')]),
  ];
  expect(commonPath(rows)).toBeNull();
});

test('the most shared final path wins; duplicates collapse; unknown rows are skipped', () => {
  const shared = [
    { type: 'login' },
    visit('/boards'),
    visit('/boards'),
    visit('/board/:boardId'),
    use('card.move'),
    { type: 'click', element: 'card.save' },
    { type: 'click', element: null },
    { type: 'page_view', page: null },
    { type: 'feature_use', feature: null },
    { type: 'logout' },
  ];
  const rows = [];
  for (let i = 0; i < 6; i += 1) rows.push(...trail(`a${i}`, shared));
  for (let i = 0; i < 5; i += 1) rows.push(...trail(`b${i}`, [visit('/calendar')]));
  rows.push(...trail('c', [{ type: 'signup' }]));
  expect(commonPath(rows)).toEqual({
    sessions: 6,
    steps: [
      { action: 'visit', target: '/boards' },
      { action: 'visit', target: '/board/:boardId' },
      { action: 'use_feature', target: 'card.move' },
      { action: 'click', target: 'card.save' },
    ],
  });
});

test('ties are broken deterministically (longer path, then key order)', () => {
  const rows = [];
  for (let i = 0; i < 5; i += 1) rows.push(...trail(`x${i}`, [visit('/b')]));
  for (let i = 0; i < 5; i += 1) rows.push(...trail(`y${i}`, [visit('/a')]));
  expect(commonPath(rows).steps).toEqual([{ action: 'visit', target: '/a' }]);
  for (let i = 0; i < 5; i += 1) rows.push(...trail(`z${i}`, [visit('/a'), visit('/b')]));
  expect(commonPath(rows).steps).toHaveLength(2);
});

const incident = {
  id: 3,
  env: 'prod',
  pages: [],
  routes: ['/api/boards/:boardId'],
  fingerprints: [],
  segments: { device: [{ value: 'mobile', share: 0.8 }], plan: [{ value: 'free', share: 0.9 }] },
  triggers: [{ kind: 'latency', numbers: { baselineP95Ms: 340 } }],
};

test('a prod incident becomes a recette scenario built from templates and catalogue keys', () => {
  const path = { sessions: 12, steps: [{ action: 'visit', target: '/board/:boardId' }] };
  const scenario = buildScenario({ incident, targetEnv: 'recette', path });
  expect(scenario).toEqual({
    schema: 1,
    kind: 'vigie.scenario',
    incidentId: 3,
    sourceEnv: 'prod',
    targetEnv: 'recette',
    persona: { plan: 'free', device: 'mobile', locale: 'en' },
    steps: [
      { action: 'visit', target: '/board/:boardId', expect: { maxDurationMs: 340, status: 200 } },
    ],
    watch: { routes: ['/api/boards/:boardId'], fingerprints: [] },
    basis: { pathSessions: 12 },
  });
  expect(path.steps[0].expect).toBeUndefined();
});

test('without a shared path the scenario visits the incident page (or /), expecting success', () => {
  const noLatency = {
    ...incident,
    triggers: [{ kind: 'error_spike' }],
    segments: { device: [], plan: [] },
  };
  const s = buildScenario({ incident: noLatency, targetEnv: 'dev', path: null });
  expect(s.steps).toEqual([{ action: 'visit', target: '/', expect: { status: 200 } }]);
  expect(s.persona).toEqual({ plan: 'free', device: 'desktop', locale: 'en' });
  expect(s.basis.pathSessions).toBe(0);
  const withPage = buildScenario({
    incident: { ...noLatency, pages: ['/board/:boardId'] },
    targetEnv: 'dev',
    path: null,
  });
  expect(withPage.steps[0].target).toBe('/board/:boardId');
  expect(
    buildScenario({ incident: { ...noLatency, segments: {} }, targetEnv: 'dev', path: null })
      .persona.plan,
  ).toBe('free');
});

test('the expectation never sits on a click: trailing clicks are dropped', () => {
  const click = { action: 'click', target: 'card.save' };
  const path = { sessions: 6, steps: [{ action: 'visit', target: '/board/:boardId' }, click] };
  const s = buildScenario({ incident, targetEnv: 'dev', path });
  expect(s.steps).toEqual([
    { action: 'visit', target: '/board/:boardId', expect: { maxDurationMs: 340, status: 200 } },
  ]);
  const onlyClicks = buildScenario({
    incident,
    targetEnv: 'dev',
    path: { sessions: 6, steps: [click] },
  });
  expect(onlyClicks.steps).toEqual([
    { action: 'visit', target: '/', expect: { maxDurationMs: 340, status: 200 } },
  ]);
});

test('scenarios can never target prod', () => {
  expect(() => buildScenario({ incident, targetEnv: 'prod', path: null })).toThrow(
    'figura_target_forbidden',
  );
});

const valid = {
  schema: 1,
  sourceEnv: 'prod',
  targetEnv: 'dev',
  steps: [
    { action: 'login', target: null },
    { action: 'signup', target: null },
    { action: 'use_feature', target: 'card.move' },
    { action: 'click', target: 'card.save' },
    { action: 'wait', target: '/boards' },
  ],
};

test('validation accepts catalogue keys and templates only', () => {
  expect(validateScenario(valid)).toBe(valid);
  const bad =
    (steps, over = {}) =>
    () =>
      validateScenario({ ...valid, steps, ...over });
  expect(bad([{ action: 'visit', target: '/board/42' }])).toThrow('invalid_scenario');
  expect(bad([{ action: 'use_feature', target: 'card.teleport' }])).toThrow('invalid_scenario');
  expect(bad([{ action: 'click', target: 'Save changes' }])).toThrow('invalid_scenario');
  expect(bad([{ action: 'visit', target: null }])).toThrow('invalid_scenario');
  expect(bad([{ action: 'type', target: '/x' }])).toThrow('invalid_scenario');
  expect(bad([])).toThrow('invalid_scenario');
  expect(bad(valid.steps, { schema: 2 })).toThrow('invalid_scenario');
  expect(bad(valid.steps, { sourceEnv: 'staging' })).toThrow('invalid_env');
});
