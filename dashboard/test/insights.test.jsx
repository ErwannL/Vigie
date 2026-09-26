import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { FunnelsPage } from '../src/pages/FunnelsPage.jsx';
import { LandingPage } from '../src/pages/LandingPage.jsx';
import { UsagePage } from '../src/pages/UsagePage.jsx';
import { fakeApi, failing, renderWithApp } from './fakes.jsx';
import * as fx from './fixtures.js';

const noDataApi = () =>
  fakeApi({
    insight: vi.fn(async (name) =>
      name === 'errors' ? { ...fx.noData(), plan: [], device: [] } : fx.noData(),
    ),
  });

test('usage: people per feature (masked as "< 10"), never/rarely used, lifts, segments, errors', async () => {
  renderWithApp(<UsagePage />);
  expect(await screen.findByText('Active people in the window: 400')).toBeInTheDocument();
  const bars = screen.getByRole('list', { name: 'People per feature' });
  expect(within(bars).getAllByText('< 10')).toHaveLength(2);
  expect(screen.getByRole('heading', { name: 'Never used' }).nextSibling).toHaveTextContent(
    'import.trello',
  );
  expect(screen.getByRole('heading', { name: 'Rarely used' }).nextSibling).toHaveTextContent(
    'None',
  );
  expect(screen.getByText('+60 %')).toBeInTheDocument();
  expect(screen.getByText('+30 %')).toBeInTheDocument();
  expect(screen.getByText('-2 %')).toBeInTheDocument();
  expect(await screen.findByRole('list', { name: 'Plan' })).toHaveTextContent('enterprise< 10');
  expect(screen.getByText('Plan: free')).toBeInTheDocument();
  expect(screen.getByText('Device: mobile')).toBeInTheDocument();
  const teamRow = screen.getByText('Plan: team').closest('tr');
  expect(within(teamRow).getAllByText('< 10')).toHaveLength(2);
});

test('usage: the window selector reloads every section', async () => {
  const user = userEvent.setup();
  const { api } = renderWithApp(<UsagePage />);
  await screen.findByText('Active people in the window: 400');
  await user.selectOptions(screen.getByLabelText('Window'), '90');
  await waitFor(() => expect(api.insight).toHaveBeenCalledWith('errors', 'prod', { days: '90' }));
  expect(api.insight).toHaveBeenCalledWith('usage', 'prod', { days: '90' });
});

test('no analytics consent data: a clear state instead of charts (errors still shown)', async () => {
  renderWithApp(<UsagePage />, { api: noDataApi(), env: 'dev' });
  expect(await screen.findAllByText('No analytics consent data yet')).toHaveLength(2);
  expect(screen.queryByRole('list', { name: 'People per feature' })).toBeNull();
  expect(screen.getByRole('columnheader', { name: 'Sessions with an error' })).toBeInTheDocument();
});

test('funnels: steps with conversion and drop-off, split by segment', async () => {
  const user = userEvent.setup();
  const { api } = renderWithApp(<FunnelsPage />);
  expect(await screen.findByRole('heading', { name: 'Upgrade' })).toBeInTheDocument();
  expect(screen.getAllByText('20 · 40 % converted · 60 % drop-off')).toHaveLength(2);
  expect(screen.getByText('Landing visit').nextSibling.nextSibling).toHaveTextContent('< 10');
  expect(screen.getByRole('heading', { name: 'mobile' })).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('Split by'), 'device');
  await waitFor(() =>
    expect(api.insight).toHaveBeenLastCalledWith('funnels', 'prod', { days: '28', by: 'device' }),
  );
  renderWithApp(<FunnelsPage />, { api: noDataApi() });
  expect(await screen.findByText('No analytics consent data yet')).toBeInTheDocument();
});

test('landing: visits, clicks per element, new vs returning conversion', async () => {
  renderWithApp(<LandingPage />);
  expect(await screen.findByText((1234).toLocaleString())).toBeInTheDocument();
  expect(screen.getByText('250 visitors · 31.2 %')).toBeInTheDocument();
  expect(screen.getByText('< 10 visitors · 0.4 %')).toBeInTheDocument();
  const returning = screen.getByText('Returning accounts').closest('tr');
  expect(within(returning).getByText('< 10')).toBeInTheDocument();
  expect(within(returning).getAllByText('—')).toHaveLength(2);
  expect(screen.getByText('New visitors').closest('tr')).toHaveTextContent('20 %');
  renderWithApp(<LandingPage />, { api: noDataApi() });
  expect(await screen.findByText('No analytics consent data yet')).toBeInTheDocument();
});

test('insight errors are translated', async () => {
  renderWithApp(<LandingPage />, { api: fakeApi({ insight: failing('internal_error') }) });
  expect(await screen.findByText('Vigie had an internal error.')).toBeInTheDocument();
});
