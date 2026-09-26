import { useCallback, useState } from 'react';
import { useApp } from '../context.js';
import { Loadable } from '../components/Status.jsx';
import { Select } from '../components/Select.jsx';
import { ErrorMessage } from '../components/Status.jsx';
import { dateTime } from '../format.js';
import { useResource } from '../hooks/useResource.js';
import { ComparePanel } from './ComparePanel.jsx';
import { IncidentDetail } from './IncidentDetail.jsx';
import { incidentLabel, segmentSummary } from './incidentText.js';

const STATUSES = ['', 'open', 'reproducing', 'confirmed', 'not_reproduced', 'resolved', 'reopened'];

function IncidentTable({ incidents, onOpen }) {
  const { lang, t } = useApp();
  if (incidents.length === 0) return <p className="muted">{t('incidents.none')}</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>{t('incident.severity')}</th>
          <th>{t('incident.what')}</th>
          <th>{t('incident.status')}</th>
          <th>{t('incident.affected')}</th>
          <th>{t('incident.lastSeen')}</th>
        </tr>
      </thead>
      <tbody>
        {incidents.map((i) => (
          <tr key={i.id}>
            <td>
              <span className={`sev sev-${i.severity}`}>{t(`severity.${i.severity}`)}</span>
            </td>
            <td>
              <button type="button" className="link" onClick={() => onOpen(i.id)}>
                {incidentLabel(i, t)}
              </button>
            </td>
            <td>{t(`status.${i.status}`)}</td>
            <td>{segmentSummary(i.segments, t)}</td>
            <td>{dateTime(i.lastSeen, lang)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Module 1: incidents of the selected environment, detection on demand, env comparison. */
export function IncidentsPage() {
  const { api, env, t } = useApp();
  const [status, setStatus] = useState('');
  const [openId, setOpenId] = useState(null);
  const [detectError, setDetectError] = useState(null);
  const load = useCallback(() => api.incidents(env, status), [api, env, status]);
  const list = useResource(load);

  const detect = async () => {
    setDetectError(null);
    try {
      await api.detect(env);
      list.reload();
    } catch (error) {
      setDetectError(error);
    }
  };

  if (openId !== null) return <IncidentDetail id={openId} onBack={() => setOpenId(null)} />;
  return (
    <section>
      <div className="toolbar">
        <h1>{t('incidents.title')}</h1>
        <Select
          id="status"
          label={t('incidents.filter')}
          value={status}
          options={STATUSES.map((s) => ({
            value: s,
            label: t(s ? `status.${s}` : 'incidents.all'),
          }))}
          onChange={setStatus}
        />
        <button type="button" onClick={detect}>
          {t('incidents.detectNow')}
        </button>
      </div>
      {detectError && <ErrorMessage error={detectError} />}
      <Loadable resource={list}>
        {(data) => <IncidentTable incidents={data.incidents} onOpen={setOpenId} />}
      </Loadable>
      <ComparePanel />
    </section>
  );
}
