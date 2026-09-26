import { useCallback, useState } from 'react';
import { useApp } from '../context.js';
import { ErrorMessage, Loadable } from '../components/Status.jsx';
import { dateTime } from '../format.js';
import { useResource } from '../hooks/useResource.js';
import { REPLAYABLE, incidentLabel, segmentSummary } from './incidentText.js';

const TARGETS = ['dev', 'recette'];

function Facts({ incident }) {
  const { lang, t } = useApp();
  const rows = [
    ['incident.status', t(`status.${incident.status}`)],
    ['incident.severity', t(`severity.${incident.severity}`)],
    ['incident.affected', segmentSummary(incident.segments, t)],
    ['incident.routes', incident.routes.join(', ') || '—'],
    ['incident.pages', incident.pages.join(', ') || '—'],
    ['incident.features', incident.features.join(', ') || '—'],
    ['incident.fingerprints', incident.fingerprints.join(', ') || '—'],
    ['incident.version', incident.appVersion ?? '—'],
    ['incident.firstSeen', dateTime(incident.firstSeen, lang)],
    ['incident.lastSeen', dateTime(incident.lastSeen, lang)],
  ];
  return (
    <dl className="facts">
      {rows.map(([key, value]) => (
        <div key={key}>
          <dt>{t(key)}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The numbers that triggered the incident: every incident explains itself. */
function Triggers({ triggers }) {
  const { lang, t } = useApp();
  return (
    <table>
      <thead>
        <tr>
          <th>{t('trigger.kind')}</th>
          <th>{t('trigger.source')}</th>
          <th>{t('trigger.numbers')}</th>
          <th>{t('trigger.at')}</th>
        </tr>
      </thead>
      <tbody>
        {triggers.map((tr, i) => (
          <tr key={`${tr.kind}-${i}`}>
            <td>{t(`kind.${tr.kind}`)}</td>
            <td>{t(`source.${tr.source}`)}</td>
            <td>
              <code>{JSON.stringify(tr.numbers)}</code>
            </td>
            <td>{dateTime(tr.detectedAt, lang)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Replay({ replay }) {
  const { t } = useApp();
  if (replay === null) return <p className="muted">{t('replay.none')}</p>;
  return (
    <div>
      <p>
        {t('replay.summary', {
          state: t(`replay.state.${replay.state}`),
          target: t(`env.${replay.targetEnv}`),
          source: t(`env.${replay.sourceEnv}`),
        })}
      </p>
      <details>
        <summary>{t('replay.scenario')}</summary>
        <pre>{JSON.stringify(replay.scenario, null, 2)}</pre>
      </details>
      {replay.evidence && <pre>{JSON.stringify(replay.evidence, null, 2)}</pre>}
    </div>
  );
}

function Actions({ incident, onDone }) {
  const { api, env, t } = useApp();
  const [error, setError] = useState(null);
  const act = async (call) => {
    setError(null);
    try {
      await call();
      onDone();
    } catch (err) {
      setError(err);
    }
  };
  const open = REPLAYABLE.includes(incident.status);
  return (
    <div className="actions">
      {TARGETS.map((target) => (
        <button
          key={target}
          type="button"
          disabled={!open}
          onClick={() => act(() => api.replay(env, incident.id, target))}
        >
          {t('replay.run', { target: t(`env.${target}`) })}
        </button>
      ))}
      <button
        type="button"
        disabled={!open}
        onClick={() => act(() => api.resolve(env, incident.id))}
      >
        {t('incident.resolve')}
      </button>
      {error && <ErrorMessage error={error} />}
    </div>
  );
}

/** One incident: facts, triggering numbers, Figura replay and history. */
export function IncidentDetail({ id, onBack }) {
  const { api, env, lang, t } = useApp();
  const load = useCallback(() => api.incident(env, id), [api, env, id]);
  const resource = useResource(load);
  return (
    <section>
      <button type="button" className="link" onClick={onBack}>
        ← {t('common.back')}
      </button>
      <Loadable resource={resource}>
        {({ incident }) => (
          <>
            <h1>{incidentLabel(incident, t)}</h1>
            {incident.sinceVersion && (
              <p className="marker">{t('incident.since', { version: incident.sinceVersion })}</p>
            )}
            <Facts incident={incident} />
            <h2>{t('incident.triggers')}</h2>
            <Triggers triggers={incident.triggers} />
            <h2>{t('replay.title')}</h2>
            <Replay replay={incident.replay} />
            <Actions incident={incident} onDone={resource.reload} />
            <h2>{t('incident.history')}</h2>
            <ol className="history">
              {incident.history.map((h, i) => (
                <li key={`${h.at}-${i}`}>
                  {dateTime(h.at, lang)} — {t(`history.${h.event}`)}
                </li>
              ))}
            </ol>
          </>
        )}
      </Loadable>
    </section>
  );
}
