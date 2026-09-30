import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { App } from '../src/App.jsx';
import { createApi } from '../src/api.js';
import { AUTHOR, DEFAULT_ORQEA_URL } from '../src/components/Brand.jsx';
import { COLORS, Logo, TOWER, WAVES } from '../src/components/Logo.jsx';
import { safeStorage } from '../src/storage.js';
import { fakeApi } from './fakes.jsx';

const ORQEA = 'http://localhost:3001/apps/return';

function setup({ hash = '', pathname = '/', api = fakeApi(), language = 'fr-FR' } = {}) {
  render(
    <App
      api={api}
      location={{ hash, pathname, search: '' }}
      history={{ replaceState: vi.fn() }}
      session={safeStorage(() => window.sessionStorage)}
      prefs={safeStorage(() => window.localStorage)}
      now={() => new Date('2026-09-01T12:00:00Z')}
      navigatorLanguage={language}
    />,
  );
  return api;
}

test('the logo is a watchtower with four waves, decorative unless titled', () => {
  const { container, rerender } = render(<Logo />);
  const svg = container.querySelector('svg');
  expect(svg).toHaveAttribute('aria-hidden', 'true');
  expect(svg).toHaveAttribute('class', 'vg-logo vg-logo--static');
  expect(svg).toHaveAttribute('width', '32');
  expect(svg.querySelectorAll('.vg-wave')).toHaveLength(WAVES.length);
  rerender(<Logo size={56} mode="loop" title="Vigie" />);
  expect(screen.getByRole('img', { name: 'Vigie' })).toHaveClass('vg-logo--loop');
});

test('the static files draw the same logo, the animated one stops under reduced motion', () => {
  for (const f of ['favicon.svg', 'logo-animated.svg']) {
    const svg = readFileSync(`public/${f}`, 'utf8');
    for (const d of [TOWER.roof, TOWER.legs, ...WAVES]) expect(svg).toContain(`d="${d}"`);
    for (const c of Object.values(COLORS)) expect(svg).toContain(c);
  }
  const animated = readFileSync('public/logo-animated.svg', 'utf8');
  expect(animated).toContain('@keyframes');
  expect(animated).toContain('prefers-reduced-motion: reduce');
  const html = readFileSync('index.html', 'utf8');
  expect(html).toContain('<title>Vigie by Orqea</title>');
  expect(html).toContain('href="/favicon.svg"');
});

test('header: logo, « by Orqea », credits and the way back to the configured Orqea', async () => {
  setup({ hash: '#sso=jwt', api: fakeApi({ orqeaUrl: vi.fn(async () => ORQEA) }) });
  const header = (await screen.findByTestId('env-badge')).closest('header');
  expect(header).toHaveTextContent('Vigie par Orqea');
  expect(within(header).getByRole('img', { name: 'Vigie' })).toHaveClass('vg-logo--hover');
  const back = await within(header).findByRole('link', { name: '← Revenir sur Orqea' });
  expect(back).toHaveAttribute('href', ORQEA);
  const owner = within(header).getByRole('link', { name: 'Propulsé par Orqea' });
  expect(owner).toHaveAttribute('href', ORQEA);
  expect(owner).toHaveAttribute('target', '_top');
  expect(back).toHaveAttribute('target', '_top');
  const author = within(header).getByRole('link', {
    name: 'Développé par Erwann Laplante',
  });
  expect(author).toHaveTextContent('Développé par Erwann Laplante');
  expect(author).toHaveAttribute('href', AUTHOR.href);
  expect(author).toHaveAttribute('target', '_blank');
  expect(author).toHaveAttribute('rel', 'noreferrer noopener');
});

test('the gate is branded, with orqea.dev when the URL is unknown', async () => {
  setup({ language: 'en-GB' });
  await screen.findByRole('heading', { name: 'Open Vigie from the Orqea admin console' });
  expect(screen.getByRole('link', { name: '← Back to Orqea' })).toHaveAttribute(
    'href',
    DEFAULT_ORQEA_URL,
  );
  expect(screen.getByRole('img', { name: 'Vigie' })).toHaveClass('vg-logo--hover');
  expect(screen.getByText('Developed by Erwann Laplante')).toBeInTheDocument();
});

test('any path but / is a branded 404, even without a session', async () => {
  setup({ pathname: '/nope', api: fakeApi({ orqeaUrl: vi.fn(async () => ORQEA) }) });
  expect(screen.getByRole('heading', { name: '404 — page introuvable' })).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: '← Revenir sur Orqea' })).toHaveAttribute(
    'href',
    ORQEA,
  );
});

test('api.orqeaUrl reads /healthz and never throws', async () => {
  const api = (res) => createApi({ base: '/api', fetchImpl: vi.fn(res) });
  const ok = (data) => async () => ({ ok: true, status: 200, json: async () => data });
  const okApi = api(ok({ status: 'ok', orqeaUrl: ORQEA }));
  expect(await okApi.orqeaUrl()).toBe(ORQEA);
  expect(await api(ok({ status: 'ok' })).orqeaUrl()).toBeNull();
  expect(
    await api(async () => {
      throw new Error('down');
    }).orqeaUrl(),
  ).toBeNull();
});

test('the way back is hidden inside an iframe (the Orqea console)', async () => {
  const top = vi.spyOn(window, 'top', 'get').mockReturnValue({});
  setup({ pathname: '/nope' });
  expect(screen.getByRole('heading', { name: '404 — page introuvable' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Revenir sur Orqea/ })).toBeNull();
  top.mockRestore();
});

test('the logo also animates on keyboard focus, and stays still under reduced motion', () => {
  const css = readFileSync('src/styles.css', 'utf8');
  expect(css).toContain('.vg-hover:focus-within .vg-logo--hover .vg-wave');
  expect(css).toContain('prefers-reduced-motion: reduce');
});
