import { render } from '@testing-library/react';
import { vi } from 'vitest';
import { AppContext } from '../src/context.js';
import { translate } from '../src/i18n/index.js';
import * as fx from './fixtures.js';

const INSIGHTS = {
  usage: fx.usage,
  segments: fx.segments,
  errors: fx.errors,
  funnels: fx.funnels,
  landing: fx.landing,
};

/** A fake API client returning the fixtures; override any method. */
export function fakeApi(over = {}) {
  return {
    onUnauthorized: vi.fn(),
    orqeaUrl: vi.fn(async () => null),
    setToken: vi.fn(),
    login: vi.fn(async () => ({
      token: 'tok',
      expiresAt: '2099-01-01T00:00:00.000Z',
      operator: { sub: 'op' },
    })),
    settings: vi.fn(async () => fx.settings),
    incidents: vi.fn(async (env) => ({ env, incidents: [fx.incident, fx.funnelIncident] })),
    incident: vi.fn(async () => ({ incident: fx.incident })),
    replay: vi.fn(async () => ({ incident: fx.replayed })),
    resolve: vi.fn(async () => ({ incident: { ...fx.incident, status: 'resolved' } })),
    detect: vi.fn(async () => ({ incidents: [] })),
    routes: vi.fn(async (env) => ({ env, routes: ['/api/boards/:boardId'] })),
    compare: vi.fn(async () => fx.compare),
    insight: vi.fn(async (name) => INSIGHTS[name]),
    previewPersonas: vi.fn(async () => ({ set: fx.personaSet })),
    pushPersonas: vi.fn(async () => ({ pushed: true, accepted: 1, set: fx.personaSet })),
    personaSets: vi.fn(async () => fx.personaHistory),
    ...over,
  };
}

export function renderWithApp(ui, { api = fakeApi(), env = 'prod', lang = 'en' } = {}) {
  const t = (key, vars) => translate(lang, key, vars);
  const result = render(
    <AppContext.Provider value={{ api, env, lang, t }}>{ui}</AppContext.Provider>,
  );
  return { ...result, api };
}

export const failing = (code) =>
  vi.fn(async () => {
    throw Object.assign(new Error(code), { code });
  });
