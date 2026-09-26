import { useCallback, useState } from 'react';
import { useApp } from '../context.js';
import { BarList } from '../components/BarList.jsx';
import { Loadable, NoAnalytics } from '../components/Status.jsx';
import { count, percent, signedPercent } from '../format.js';
import { useResource } from '../hooks/useResource.js';
import { DaysSelect } from './DaysSelect.jsx';

function FeatureTable({ features }) {
  const { t } = useApp();
  return (
    <table>
      <thead>
        <tr>
          <th>{t('usage.feature')}</th>
          <th>{t('usage.users')}</th>
          <th>{t('usage.dau')}</th>
          <th>{t('usage.wau')}</th>
          <th>{t('usage.trend')}</th>
          <th>{t('usage.share')}</th>
          <th>{t('usage.retentionLift')}</th>
          <th>{t('usage.upgradeLift')}</th>
        </tr>
      </thead>
      <tbody>
        {features.map((f) => (
          <tr key={f.feature}>
            <td>
              <code>{f.feature}</code>
            </td>
            <td>{count(f.users, t)}</td>
            <td>{count(f.dau, t)}</td>
            <td>{count(f.wau, t)}</td>
            <td>{signedPercent(f.trend)}</td>
            <td>{percent(f.shareOfActive)}</td>
            <td>{signedPercent(f.outcomes?.retentionLift ?? null)}</td>
            <td>{signedPercent(f.outcomes?.upgradeLift ?? null)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Chips({ title, items }) {
  const { t } = useApp();
  return (
    <div>
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="muted">{t('common.none')}</p>
      ) : (
        <ul className="chips">
          {items.map((i) => (
            <li key={i}>
              <code>{i}</code>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Usage({ data }) {
  const { t } = useApp();
  if (!data.analytics.hasData) return <NoAnalytics />;
  const bars = data.features.map((f) => ({
    key: f.feature,
    label: f.feature,
    value: f.users.value,
    display: count(f.users, t),
  }));
  return (
    <>
      <p>{t('usage.activeUsers', { n: count(data.activeUsers, t) })}</p>
      <BarList items={bars} label={t('usage.usersPerFeature')} />
      <div className="columns">
        <Chips title={t('usage.neverUsed')} items={data.neverUsed} />
        <Chips title={t('usage.rarelyUsed')} items={data.rarelyUsed} />
      </div>
      <FeatureTable features={data.features} />
    </>
  );
}

function Segments({ data }) {
  const { t } = useApp();
  if (!data.analytics.hasData) return <NoAnalytics />;
  return (
    <div className="columns">
      {Object.entries(data.byDimension).map(([dim, values]) => (
        <div key={dim}>
          <h3>{t(`segment.${dim}`)}</h3>
          <BarList
            label={t(`segment.${dim}`)}
            items={values.map((v) => ({
              key: v.value,
              label: v.value,
              value: v.accounts.value,
              display: count(v.accounts, t),
            }))}
          />
        </div>
      ))}
    </div>
  );
}

function ErrorsBySegment({ data }) {
  const { t } = useApp();
  return (
    <table>
      <thead>
        <tr>
          <th>{t('errorsBySegment.segment')}</th>
          <th>{t('errorsBySegment.sessions')}</th>
          <th>{t('errorsBySegment.errors')}</th>
          <th>{t('errorsBySegment.rate')}</th>
        </tr>
      </thead>
      <tbody>
        {['plan', 'device'].flatMap((dim) =>
          data[dim].map((r) => (
            <tr key={`${dim}-${r.value}`}>
              <td>
                {t(`segment.${dim}`)}: {r.value}
              </td>
              <td>{count(r.sessions, t)}</td>
              <td>{r.errors ?? t('common.belowK')}</td>
              <td>{percent(r.errorSessionRate)}</td>
            </tr>
          )),
        )}
      </tbody>
    </table>
  );
}

/** Module 2: feature usage, never/rarely used features, segments and errors per segment. */
export function UsagePage() {
  const { api, env, t } = useApp();
  const [days, setDays] = useState('28');
  const usage = useResource(
    useCallback(() => api.insight('usage', env, { days }), [api, env, days]),
  );
  const segments = useResource(
    useCallback(() => api.insight('segments', env, { days }), [api, env, days]),
  );
  const errors = useResource(
    useCallback(() => api.insight('errors', env, { days }), [api, env, days]),
  );
  return (
    <section>
      <div className="toolbar">
        <h1>{t('usage.title')}</h1>
        <DaysSelect value={days} onChange={setDays} />
      </div>
      <Loadable resource={usage}>{(data) => <Usage data={data} />}</Loadable>
      <h2>{t('segments.title')}</h2>
      <Loadable resource={segments}>{(data) => <Segments data={data} />}</Loadable>
      <h2>{t('errorsBySegment.title')}</h2>
      <Loadable resource={errors}>{(data) => <ErrorsBySegment data={data} />}</Loadable>
    </section>
  );
}
