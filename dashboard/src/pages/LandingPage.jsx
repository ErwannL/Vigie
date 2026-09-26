import { useCallback, useState } from 'react';
import { useApp } from '../context.js';
import { BarList } from '../components/BarList.jsx';
import { Loadable, NoAnalytics } from '../components/Status.jsx';
import { count, percent } from '../format.js';
import { useResource } from '../hooks/useResource.js';
import { DaysSelect } from './DaysSelect.jsx';

function Landing({ data }) {
  const { t } = useApp();
  if (!data.analytics.hasData) return <NoAnalytics />;
  return (
    <>
      <div className="kpis">
        <div>
          <span className="kpi">{data.views.toLocaleString()}</span>
          <span>{t('landing.views')}</span>
        </div>
        <div>
          <span className="kpi">{count(data.visitors, t)}</span>
          <span>{t('landing.visitors')}</span>
        </div>
      </div>
      <h2>{t('landing.clicks')}</h2>
      <BarList
        label={t('landing.clicks')}
        items={data.clicks.map((c) => ({
          key: c.element,
          label: c.element,
          value: c.visitors.value,
          display: t('landing.clickValue', { n: count(c.visitors, t), rate: percent(c.clickRate) }),
        }))}
      />
      <h2>{t('landing.conversion')}</h2>
      <table>
        <thead>
          <tr>
            <th>{t('landing.group')}</th>
            <th>{t('landing.visitors')}</th>
            <th>{t('landing.signupRate')}</th>
            <th>{t('landing.loginRate')}</th>
          </tr>
        </thead>
        <tbody>
          {['new', 'returning'].map((kind) => (
            <tr key={kind}>
              <td>{t(`landing.${kind}`)}</td>
              <td>{count(data.conversion[kind].visitors, t)}</td>
              <td>{percent(data.conversion[kind].signupRate)}</td>
              <td>{percent(data.conversion[kind].loginRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** Module 2: landing page visits, clicks per data-vigie element, conversion into signup/login. */
export function LandingPage() {
  const { api, env, t } = useApp();
  const [days, setDays] = useState('28');
  const resource = useResource(
    useCallback(() => api.insight('landing', env, { days }), [api, env, days]),
  );
  return (
    <section>
      <div className="toolbar">
        <h1>{t('landing.title')}</h1>
        <DaysSelect value={days} onChange={setDays} />
      </div>
      <Loadable resource={resource}>{(data) => <Landing data={data} />}</Loadable>
    </section>
  );
}
