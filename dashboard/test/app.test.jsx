import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { App } from '../src/App.jsx';
import { safeStorage } from '../src/storage.js';
import { fakeApi } from './fakes.jsx';

function setup({ hash = '', api = fakeApi(), stored = null, prefs = {}, language = 'en-GB' } = {}) {
  const session = safeStorage(() => window.sessionStorage);
  if (stored) session.set('vigie.session', JSON.stringify(stored));
  const prefStore = safeStorage(() => window.localStorage);
  for (const [k, v] of Object.entries(prefs)) prefStore.set(k, v);
  const history = { replaceState: vi.fn() };
  const location = { hash, pathname: '/', search: '' };
  render(
    <App
      api={api}
      location={location}
      history={history}
      session={session}
      prefs={prefStore}
      now={() => new Date('2026-09-01T12:00:00Z')}
      navigatorLanguage={language}
    />,
  );
  return { api, history, session, prefStore };
}

test('without a handoff the dashboard explains how to get in (no login screen)', async () => {
  setup();
  expect(
    await screen.findByRole('heading', { name: 'Open Vigie from the Orqea admin console' }),
  ).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.queryByLabelText(/password/i)).toBeNull();
});

test('the #sso handoff is removed from the URL, exchanged, and the session is stored', async () => {
  const { api, history, session } = setup({ hash: '#sso=the.jwt.token' });
  expect(history.replaceState).toHaveBeenCalledWith(null, '', '/');
  expect(await screen.findByTestId('env-badge')).toHaveTextContent('Viewing: prod');
  expect(api.login).toHaveBeenCalledWith('the.jwt.token');
  expect(api.setToken).toHaveBeenCalledWith('tok');
  expect(JSON.parse(session.get('vigie.session')).token).toBe('tok');
});

test('the handoff env opens the matching environment and the fragment is removed', async () => {
  const { api, history } = setup({ hash: '#sso=the.jwt.token&env=recette' });
  expect(history.replaceState).toHaveBeenCalledWith(null, '', '/');
  expect(await screen.findByTestId('env-badge')).toHaveTextContent('Viewing: recette (staging)');
  expect(api.login).toHaveBeenCalledWith('the.jwt.token');
});

test('an unknown handoff env falls back to prod', async () => {
  setup({ hash: '#sso=the.jwt.token&env=evil' });
  expect(await screen.findByTestId('env-badge')).toHaveTextContent('Viewing: prod');
});

test('a failed handoff shows the translated reason, never the raw code', async () => {
  const api = fakeApi({
    login: vi.fn(async () =>
      Promise.reject(Object.assign(new Error('x'), { code: 'sso_replayed' })),
    ),
  });
  setup({ hash: '#sso=used', api, language: 'fr-FR' });
  expect(
    await screen.findByText('Le lien de connexion a déjà servi. Rouvrez Vigie depuis la console.'),
  ).toBeInTheDocument();
  expect(screen.queryByText('sso_replayed')).toBeNull();
});

test('a stored session is reused; a 401 later shows the expired screen', async () => {
  const { api, session } = setup({ stored: { token: 'kept', expiresAt: '2026-09-01T13:00:00Z' } });
  expect(await screen.findByTestId('env-badge')).toBeInTheDocument();
  expect(api.setToken).toHaveBeenCalledWith('kept');
  const onUnauthorized = api.onUnauthorized.mock.calls[0][0];
  act(() => onUnauthorized());
  expect(
    await screen.findByRole('heading', { name: 'Your Vigie session has expired' }),
  ).toBeInTheDocument();
  expect(session.get('vigie.session')).toBeNull();
});

test('while signing in, a checking screen is shown', async () => {
  let resolve;
  const api = fakeApi({ login: vi.fn(() => new Promise((r) => (resolve = r))) });
  setup({ hash: '#sso=slow', api });
  const loader = screen.getByRole('status');
  expect(loader).toHaveTextContent('Signing you in…');
  expect(loader.querySelector('svg.vg-logo--loop')).not.toBeNull();
  await act(async () => resolve({ token: 't', expiresAt: '2099-01-01T00:00:00Z' }));
  expect(await screen.findByTestId('env-badge')).toBeInTheDocument();
});

test('dark by default; theme and language switch and are remembered', async () => {
  const user = userEvent.setup();
  const { prefStore } = setup({ stored: { token: 't', expiresAt: '2099-01-01T00:00:00Z' } });
  await screen.findByTestId('env-badge');
  expect(document.documentElement.dataset.theme).toBe('dark');
  await user.click(screen.getByRole('button', { name: 'Light theme' }));
  expect(document.documentElement.dataset.theme).toBe('light');
  expect(prefStore.get('vigie.theme')).toBe('light');
  await user.click(screen.getByRole('button', { name: 'Dark theme' }));
  await user.selectOptions(screen.getByLabelText('Language'), 'fr');
  expect(document.documentElement.lang).toBe('fr');
  expect(prefStore.get('vigie.lang')).toBe('fr');
  expect(screen.getByRole('button', { name: 'Thème clair' })).toBeInTheDocument();
});

test('remembered light theme and French are applied on start', async () => {
  setup({
    stored: { token: 't', expiresAt: '2099-01-01T00:00:00Z' },
    prefs: { 'vigie.theme': 'light', 'vigie.lang': 'fr' },
  });
  expect(await screen.findByTestId('env-badge')).toHaveTextContent('Vous regardez : prod');
  expect(document.documentElement.dataset.theme).toBe('light');
});

test('the environment selector drives every page and is always visible', async () => {
  const user = userEvent.setup();
  const { api } = setup({ stored: { token: 't', expiresAt: '2099-01-01T00:00:00Z' } });
  await screen.findByTestId('env-badge');
  await waitFor(() => expect(api.incidents).toHaveBeenCalledWith('prod', ''));
  await user.selectOptions(screen.getByLabelText('Environment'), 'recette');
  expect(screen.getByTestId('env-badge')).toHaveTextContent('Viewing: recette (staging)');
  await waitFor(() => expect(api.incidents).toHaveBeenCalledWith('recette', ''));
  const nav = screen.getByRole('navigation', { name: 'Sections' });
  for (const [name, heading] of [
    ['Usage', 'Feature usage'],
    ['Funnels', 'Funnels'],
    ['Landing', 'Landing page'],
    ['Personas', 'Personas for Figura'],
    ['Settings', 'Settings'],
    ['Incidents', 'Incidents'],
  ]) {
    await user.click(within(nav).getByRole('button', { name }));
    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name })).toHaveAttribute('aria-current', 'page');
  }
  expect(api.insight).toHaveBeenCalledWith('usage', 'recette', { days: '28' });
});
