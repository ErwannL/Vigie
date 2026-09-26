import { useCallback, useState } from 'react';
import { useApp } from '../context.js';
import { BarList } from '../components/BarList.jsx';
import { Select } from '../components/Select.jsx';
import { Loadable, NoAnalytics } from '../components/Status.jsx';
import { count, percent } from '../format.js';
import { useResource } from '../hooks/useResource.js';
import { DaysSelect } from './DaysSelect.jsx';

function Steps({ steps }) {
  const { t } = useApp();
  return (
    <BarList
      label={t('funnels.steps')}
      items={steps.map((s) => ({
        key: s.key,
        label: t(`step.${s.key}`),
        value: s.count.value,
        display:
          s.conversion === null
            ? count(s.count, t)
            : t('funnels.stepValue', {
                n: count(s.count, t),
                rate: percent(s.conversion),
                drop: percent(s.dropOff),
              }),
      }))}
    />
  );
}

function Funnel({ funnel }) {
  const { t } = useApp();
  return (
    <article className="panel">
      <h2>{t(`funnel.${funnel.key}`)}</h2>
      <Steps steps={funnel.steps} />
      {funnel.groups.map((g) => (
        <div key={g.value}>
          <h3>{g.value}</h3>
          <Steps steps={g.steps} />
        </div>
      ))}
    </article>
  );
}

/** Module 2: the catalogue funnels with drop-off per step, optionally per segment. */
export function FunnelsPage() {
  const { api, env, t } = useApp();
  const [days, setDays] = useState('28');
  const [by, setBy] = useState('');
  const load = useCallback(
    () => api.insight('funnels', env, by ? { days, by } : { days }),
    [api, env, days, by],
  );
  const resource = useResource(load);
  return (
    <section>
      <div className="toolbar">
        <h1>{t('funnels.title')}</h1>
        <DaysSelect value={days} onChange={setDays} />
        <Select
          id="by"
          label={t('funnels.by')}
          value={by}
          options={[
            { value: '', label: t('funnels.byNone') },
            { value: 'plan', label: t('segment.plan') },
            { value: 'device', label: t('segment.device') },
          ]}
          onChange={setBy}
        />
      </div>
      <Loadable resource={resource}>
        {(data) =>
          data.analytics.hasData ? (
            data.funnels.map((f) => <Funnel key={f.key} funnel={f} />)
          ) : (
            <NoAnalytics />
          )
        }
      </Loadable>
    </section>
  );
}
