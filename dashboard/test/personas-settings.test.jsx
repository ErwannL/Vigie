import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { PersonasPage } from '../src/pages/PersonasPage.jsx';
import { SettingsPage } from '../src/pages/SettingsPage.jsx';
import { fakeApi, failing, renderWithApp } from './fakes.jsx';
import * as fx from './fixtures.js';

test('personas: preview from the selected env, push to the chosen Figura target, history', async () => {
  const user = userEvent.setup();
  const { api } = renderWithApp(<PersonasPage />);
  expect(
    await screen.findByText(/→ recette \(staging\): 1 personas, 1 accepted/),
  ).toBeInTheDocument();
  expect(screen.getByText(/derived from real usage in prod/)).toBeInTheDocument();
  expect(screen.getByLabelText('Figura runs in').querySelectorAll('option')).toHaveLength(2);
  await user.selectOptions(screen.getByLabelText('Figura runs in'), 'dev');
  await user.selectOptions(screen.getByLabelText('Window'), '7');
  await user.click(screen.getByRole('button', { name: 'Preview' }));
  expect(api.previewPersonas).toHaveBeenCalledWith({
    sourceEnv: 'prod',
    targetEnv: 'dev',
    days: 7,
  });
  expect(await screen.findByRole('heading', { name: 'free-mobile' })).toBeInTheDocument();
  expect(screen.getByText('Derived from 120 people and 400 sessions')).toBeInTheDocument();
  expect(screen.getByText('Plan free · mobile · fr')).toBeInTheDocument();
  expect(screen.getByText('Median session: 9 events, 4.5 min')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Push to Figura' }));
  expect(await screen.findByText('Sent to Figura: 1 personas accepted.')).toBeInTheDocument();
  await waitFor(() => expect(api.personaSets).toHaveBeenCalledTimes(2));
});

test('personas: nothing to derive, no analytics data, errors, empty history', async () => {
  const user = userEvent.setup();
  const api = fakeApi({
    previewPersonas: vi
      .fn()
      .mockResolvedValueOnce({ set: { ...fx.personaSet, personas: [] } })
      .mockResolvedValueOnce({ ...fx.noData(), set: null }),
    pushPersonas: vi
      .fn()
      .mockResolvedValueOnce({ pushed: false })
      .mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'figura_target_forbidden' })),
    personaSets: vi.fn(async () => ({ sets: [] })),
  });
  renderWithApp(<PersonasPage />, { api });
  expect(
    await screen.findByText('No persona set sent yet from this environment.'),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Preview' }));
  expect(
    await screen.findByText('No segment has enough people (k = 10) to derive a persona.'),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Preview' }));
  expect(await screen.findByText('No analytics consent data yet')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Push to Figura' }));
  expect(
    await screen.findByText('Nothing to push: no persona could be derived.'),
  ).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Push to Figura' }));
  expect(
    await screen.findByText('Figura can only run in dev or recette, never in prod.'),
  ).toBeInTheDocument();
});

test('settings: mode, retention, k, catalogue versions, source status per environment', async () => {
  renderWithApp(<SettingsPage />);
  expect(await screen.findByText('60 days (aggregates are kept longer)')).toBeInTheDocument();
  expect(screen.getByText('Development (fakes allowed)')).toBeInTheDocument();
  expect(
    screen.getByText('events v1 · features v1 · funnels v1 · segments v1'),
  ).toBeInTheDocument();
  expect(screen.getByText('Off')).toBeInTheDocument();
  expect(screen.getAllByText('Configured').length).toBeGreaterThanOrEqual(3);
  expect(screen.getAllByText('Fake (demo data)').length).toBeGreaterThanOrEqual(6);
  expect(screen.getAllByText('Not configured')).toHaveLength(2);
  expect(screen.getByText(/Figura never runs against prod/)).toBeInTheDocument();
});

test('settings: auto replay target, production mode, error', async () => {
  const api = fakeApi({
    settings: vi.fn(async () => ({
      ...fx.settings,
      mode: 'production',
      autoReplayTarget: 'recette',
    })),
  });
  renderWithApp(<SettingsPage />, { api, lang: 'fr' });
  expect(await screen.findByText('Production')).toBeInTheDocument();
  expect(screen.getAllByText('recette').length).toBeGreaterThan(0);
  renderWithApp(<SettingsPage />, { api: fakeApi({ settings: failing('unauthorized') }) });
  expect(await screen.findByText('Your session is not valid.')).toBeInTheDocument();
});

test('the browser entry mounts the app on #root and exchanges a real #sso fragment', async () => {
  document.body.innerHTML = '<div id="root"></div>';
  await import('../src/main.jsx');
  expect(
    await screen.findByRole('heading', { name: 'Open Vigie from the Orqea admin console' }),
  ).toBeInTheDocument();
  vi.resetModules();
  document.body.innerHTML = '<div id="root"></div>';
  window.location.hash = '#sso=header.claims.sig';
  window.fetch = vi.fn(async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: 'sso_expired' }),
  }));
  await import('../src/main.jsx');
  expect(
    await screen.findByText('The sign-in link has expired. Reopen Vigie from the console.'),
  ).toBeInTheDocument();
  expect(window.location.hash).toBe('');
  const [url, init] = window.fetch.mock.calls[0];
  expect(url).toBe('/api/auth/sso');
  expect(JSON.parse(init.body)).toEqual({ token: 'header.claims.sig' });
});
