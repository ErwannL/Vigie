import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { useResource } from '../src/hooks/useResource.js';
import { IncidentsPage } from '../src/pages/IncidentsPage.jsx';
import { renderWithApp, fakeApi, failing } from './fakes.jsx';
import * as fx from './fixtures.js';
import { render } from '@testing-library/react';

test('lists incidents with translated labels, severity and who is affected', async () => {
  renderWithApp(<IncidentsPage />);
  expect(
    await screen.findByRole('button', { name: 'Slow · /api/boards/:boardId' }),
  ).toBeInTheDocument();
  expect(screen.getByText('mostly mobile (86 %), free (84 %)')).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Funnel drop · activation/signup_done' }),
  ).toBeInTheDocument();
  expect(screen.getByText('—')).toBeInTheDocument();
  expect(screen.getAllByText('High')).toHaveLength(1);
});

test('status filter and "run detection now"', async () => {
  const user = userEvent.setup();
  const { api } = renderWithApp(<IncidentsPage />);
  await screen.findByRole('button', { name: 'Slow · /api/boards/:boardId' });
  await user.selectOptions(screen.getByLabelText('Status'), 'resolved');
  await waitFor(() => expect(api.incidents).toHaveBeenLastCalledWith('prod', 'resolved'));
  await user.click(screen.getByRole('button', { name: 'Run detection now' }));
  expect(api.detect).toHaveBeenCalledWith('prod');
  await waitFor(() => expect(api.incidents).toHaveBeenCalledTimes(3));
});

test('empty list, list errors and detection errors are translated', async () => {
  const user = userEvent.setup();
  const api = fakeApi({
    incidents: vi.fn(async () => ({ incidents: [] })),
    detect: failing('upstream_timeout'),
  });
  renderWithApp(<IncidentsPage />, { api });
  expect(await screen.findByText('No incident in this environment.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Run detection now' }));
  expect(await screen.findByText('A connected system did not answer in time.')).toBeInTheDocument();
  renderWithApp(<IncidentsPage />, { api: fakeApi({ incidents: failing('invalid_env') }) });
  expect(await screen.findByText('Unknown environment.')).toBeInTheDocument();
});

test('incident detail: facts, since-version marker, triggers, history; replay in recette', async () => {
  const user = userEvent.setup();
  const api = fakeApi();
  api.incident
    .mockResolvedValueOnce({ incident: fx.incident })
    .mockResolvedValue({ incident: fx.replayed });
  renderWithApp(<IncidentsPage />, { api });
  await user.click(await screen.findByRole('button', { name: 'Slow · /api/boards/:boardId' }));
  expect(
    await screen.findByRole('heading', { name: 'Slow · /api/boards/:boardId' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Since version 2.4.0')).toBeInTheDocument();
  expect(screen.getByText('card.move')).toBeInTheDocument();
  const item = (key) => screen.getByText(key).closest('li');
  expect(item('currentP95Ms')).toHaveTextContent('currentP95Ms 3763');
  expect(item('thresholds.minRatio')).toHaveTextContent('thresholds.minRatio 1.5');
  expect(item('msgKinds')).toHaveTextContent('msgKinds a, b');
  expect(item('error')).toHaveTextContent('error null');
  expect(screen.getByText('Log evidence')).toBeInTheDocument();
  expect(screen.getByText('Not replayed yet.')).toBeInTheDocument();
  expect(screen.getByText(/Opened$/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Replay in recette (staging)' }));
  expect(api.replay).toHaveBeenCalledWith('prod', 1, 'recette');
  expect(
    await screen.findByText('Replay reproduced in recette (staging) (data from prod).'),
  ).toBeInTheDocument();
  expect(screen.getByText(/fake-figura/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Replay in prod/ })).toBeNull();
  await user.click(screen.getByRole('button', { name: 'Mark resolved' }));
  expect(api.resolve).toHaveBeenCalledWith('prod', 1);
  await user.click(screen.getByRole('button', { name: '← Back' }));
  expect(await screen.findByRole('heading', { name: 'Incidents' })).toBeInTheDocument();
});

test('detail: actions disabled when not replayable, action errors shown, missing facts dashed', async () => {
  const user = userEvent.setup();
  const reproducing = {
    ...fx.funnelIncident,
    status: 'reproducing',
    replay: { ...fx.replayed.replay, state: 'running', evidence: null },
  };
  const api = fakeApi({
    incident: vi.fn(async () => ({ incident: reproducing })),
    replay: failing('figura_not_configured'),
  });
  renderWithApp(<IncidentsPage />, { api });
  await user.click(
    await screen.findByRole('button', { name: 'Funnel drop · activation/signup_done' }),
  );
  expect(
    await screen.findByText('Replay running in recette (staging) (data from prod).'),
  ).toBeInTheDocument();
  expect(screen.queryByText(/Since version/)).toBeNull();
  expect(screen.getByRole('button', { name: 'Replay in dev' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Mark resolved' })).toBeDisabled();
  api.incident.mockResolvedValue({ incident: fx.funnelIncident });
  await user.click(screen.getByRole('button', { name: '← Back' }));
  await user.click(
    await screen.findByRole('button', { name: 'Funnel drop · activation/signup_done' }),
  );
  await user.click(await screen.findByRole('button', { name: 'Replay in dev' }));
  expect(
    await screen.findByText('Figura is not configured for this environment.'),
  ).toBeInTheDocument();
});

test('compare panel: explicit side-by-side of one route in two environments', async () => {
  const user = userEvent.setup();
  const { api } = renderWithApp(<IncidentsPage />);
  const compareButton = await screen.findByRole('button', { name: 'Compare side by side' });
  expect(compareButton).toBeDisabled();
  await user.selectOptions(screen.getByLabelText('Route'), '/api/boards/:boardId');
  await user.selectOptions(screen.getByLabelText('Compare with'), 'recette');
  await user.click(compareButton);
  expect(api.compare).toHaveBeenCalledWith(['prod', 'recette'], '/api/boards/:boardId', 14);
  expect(await screen.findByRole('columnheader', { name: 'p95 in prod' })).toBeInTheDocument();
  expect(
    screen.getByRole('columnheader', { name: 'p95 in recette (staging)' }),
  ).toBeInTheDocument();
  expect(screen.getByText('2,100 ms')).toBeInTheDocument();
  expect(screen.getAllByText('—')).toHaveLength(2);
  api.compare.mockRejectedValue(
    Object.assign(new Error('x'), { code: 'compare_needs_distinct_envs' }),
  );
  await user.click(compareButton);
  expect(
    await screen.findByText('Choose two different environments to compare.'),
  ).toBeInTheDocument();
});

function Probe({ load }) {
  const r = useResource(load);
  return <p>{r.status}</p>;
}

test('late results are ignored after unmount (no state update on a gone component)', async () => {
  let resolve;
  let reject;
  const pending = vi
    .fn()
    .mockImplementationOnce(() => new Promise((r) => (resolve = r)))
    .mockImplementationOnce(() => new Promise((_r, j) => (reject = j)));
  const first = render(<Probe load={pending} />);
  first.unmount();
  await act(async () => resolve({}));
  const second = render(<Probe load={() => pending()} />);
  second.unmount();
  await act(async () => reject(new Error('late')));
  expect(pending).toHaveBeenCalledTimes(2);
});
