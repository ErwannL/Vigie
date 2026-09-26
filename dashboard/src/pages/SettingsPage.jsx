import { useCallback } from 'react';
import { useApp } from '../context.js';
import { ENVS } from '../components/Layout.jsx';
import { Loadable } from '../components/Status.jsx';
import { useResource } from '../hooks/useResource.js';

const SOURCES = ['logs', 'metrics', 'errors'];

function StatusCell({ status }) {
  const { t } = useApp();
  return <span className={`status status-${status}`}>{t(`settings.status.${status}`)}</span>;
}

function Settings({ data }) {
  const { t } = useApp();
  const facts = [
    ['settings.mode', t(`settings.mode.${data.mode}`)],
    ['settings.retention', t('settings.retentionDays', { days: data.rawRetentionDays })],
    ['settings.kAnonymity', String(data.kAnonymity)],
    [
      'settings.autoReplay',
      data.autoReplayTarget ? t(`env.${data.autoReplayTarget}`) : t('common.off'),
    ],
    ['settings.catalogues', t('settings.catalogueVersions', data.catalogues)],
  ];
  return (
    <>
      <dl className="facts">
        {facts.map(([key, value]) => (
          <div key={key}>
            <dt>{t(key)}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <h2>{t('settings.sources')}</h2>
      <table>
        <thead>
          <tr>
            <th>{t('env.label')}</th>
            <th>{t('settings.ingestion')}</th>
            {SOURCES.map((s) => (
              <th key={s}>{t(`source.${s}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ENVS.map((env) => (
            <tr key={env}>
              <td>{t(`env.${env}`)}</td>
              <td>
                <StatusCell status={data.ingestion[env] ? 'configured' : 'not_configured'} />
              </td>
              {SOURCES.map((s) => (
                <td key={s}>
                  <StatusCell status={data.adapters.sources[env][s]} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <h2>{t('settings.outputs')}</h2>
      <ul>
        {Object.entries(data.adapters.figura).map(([target, status]) => (
          <li key={target}>
            {t('settings.figuraIn', { env: t(`env.${target}`) })} <StatusCell status={status} />
          </li>
        ))}
        <li>
          {t('settings.issueSink')} <StatusCell status={data.adapters.issues} />
        </li>
      </ul>
      <p className="muted">{t('settings.figuraNeverProd')}</p>
    </>
  );
}

/** Source status (configured / fake / not configured), retention and catalogue versions. */
export function SettingsPage() {
  const { api, t } = useApp();
  const resource = useResource(useCallback(() => api.settings(), [api]));
  return (
    <section>
      <h1>{t('settings.title')}</h1>
      <Loadable resource={resource}>{(data) => <Settings data={data} />}</Loadable>
    </section>
  );
}
