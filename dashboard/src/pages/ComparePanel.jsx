import { useCallback, useState } from 'react';
import { useApp } from '../context.js';
import { ENVS } from '../components/Layout.jsx';
import { Select } from '../components/Select.jsx';
import { ErrorMessage, Loadable } from '../components/Status.jsx';
import { ms } from '../format.js';
import { useResource } from '../hooks/useResource.js';

function CompareTable({ result, envs }) {
  const { t } = useApp();
  const days = [...new Set(envs.flatMap((e) => result.series[e].map((r) => r.day)))].sort();
  const p95 = (env, day) => result.series[env].find((r) => r.day === day)?.p95_ms ?? null;
  return (
    <table>
      <thead>
        <tr>
          <th>{t('compare.day')}</th>
          {envs.map((e) => (
            <th key={e}>{t('compare.p95In', { env: t(`env.${e}`) })}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {days.map((day) => (
          <tr key={day}>
            <td>{day}</td>
            {envs.map((e) => (
              <td key={e}>{ms(p95(e, day))}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Explicit side-by-side comparison of one route in two environments. Never a merged total. */
export function ComparePanel() {
  const { api, env, t } = useApp();
  const others = ENVS.filter((e) => e !== env);
  const [other, setOther] = useState(others[0]);
  const [route, setRoute] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api.routes(env), [api, env]);
  const routes = useResource(load);
  const compare = async () => {
    setError(null);
    try {
      setResult(await api.compare([env, other], route, 14));
    } catch (err) {
      setError(err);
    }
  };
  return (
    <section className="panel">
      <h2>{t('compare.title')}</h2>
      <Loadable resource={routes}>
        {(data) => (
          <div className="toolbar">
            <Select
              id="compare-route"
              label={t('compare.route')}
              value={route}
              options={[
                { value: '', label: t('compare.pickRoute') },
                ...data.routes.map((r) => ({ value: r, label: r })),
              ]}
              onChange={setRoute}
            />
            <Select
              id="compare-env"
              label={t('compare.with')}
              value={other}
              options={others.map((e) => ({ value: e, label: t(`env.${e}`) }))}
              onChange={setOther}
            />
            <button type="button" disabled={route === ''} onClick={compare}>
              {t('compare.run')}
            </button>
          </div>
        )}
      </Loadable>
      {error && <ErrorMessage error={error} />}
      {result && <CompareTable result={result} envs={[env, other]} />}
    </section>
  );
}
