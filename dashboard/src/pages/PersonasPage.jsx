import { useCallback, useState } from 'react';
import { useApp } from '../context.js';
import { Select } from '../components/Select.jsx';
import { ErrorMessage, Loadable, NoAnalytics } from '../components/Status.jsx';
import { dateTime, percent } from '../format.js';
import { useResource } from '../hooks/useResource.js';
import { DaysSelect } from './DaysSelect.jsx';

function PersonaCard({ persona }) {
  const { t } = useApp();
  const top = Object.entries(persona.weights.features).slice(0, 5);
  return (
    <article className="panel persona">
      <h3>{persona.name}</h3>
      <p>
        {t('personas.traits', {
          plan: persona.traits.plan,
          device: persona.traits.device,
          locale: persona.traits.locale,
        })}
      </p>
      <p className="muted">
        {t('personas.sample', { people: persona.sample.people, sessions: persona.sample.sessions })}
      </p>
      <p>
        {t('personas.sessionLength', {
          events: persona.weights.sessionLength.medianEvents,
          minutes: persona.weights.sessionLength.medianMinutes,
        })}
      </p>
      <ul>
        {top.map(([feature, p]) => (
          <li key={feature}>
            <code>{feature}</code> {percent(p)}
          </li>
        ))}
      </ul>
    </article>
  );
}

function History({ sets }) {
  const { lang, t } = useApp();
  if (sets.length === 0) return <p className="muted">{t('personas.noHistory')}</p>;
  return (
    <ul>
      {sets.map((s) => (
        <li key={s.id}>
          {t('personas.historyItem', {
            at: dateTime(s.pushed_at, lang),
            target: t(`env.${s.target_env}`),
            count: s.payload.personas.length,
            accepted: s.accepted,
          })}
        </li>
      ))}
    </ul>
  );
}

/** Module 2: derive personas from the selected (source) environment and push them to Figura. */
export function PersonasPage() {
  const { api, env, t } = useApp();
  const [target, setTarget] = useState('recette');
  const [days, setDays] = useState('28');
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);
  const history = useResource(useCallback(() => api.personaSets(env), [api, env]));
  const body = { sourceEnv: env, targetEnv: target, days: Number(days) };

  const run = async (call, after) => {
    setError(null);
    setMessage(null);
    try {
      after(await call(body));
    } catch (err) {
      setError(err);
    }
  };
  const onPreview = () => run(api.previewPersonas, setPreview);
  const onPush = () =>
    run(api.pushPersonas, (result) => {
      setMessage(
        result.pushed
          ? t('personas.pushed', { accepted: result.accepted })
          : t('personas.nothingToPush'),
      );
      history.reload();
    });

  return (
    <section>
      <div className="toolbar">
        <h1>{t('personas.title')}</h1>
        <DaysSelect value={days} onChange={setDays} />
        <Select
          id="target"
          label={t('personas.target')}
          value={target}
          options={['dev', 'recette'].map((e) => ({ value: e, label: t(`env.${e}`) }))}
          onChange={setTarget}
        />
        <button type="button" onClick={onPreview}>
          {t('personas.preview')}
        </button>
        <button type="button" onClick={onPush}>
          {t('personas.push')}
        </button>
      </div>
      <p className="muted">{t('personas.explain', { source: t(`env.${env}`) })}</p>
      {error && <ErrorMessage error={error} />}
      {message && <p role="status">{message}</p>}
      {preview && preview.set === null && <NoAnalytics />}
      {preview?.set && (
        <div className="grid">
          {preview.set.personas.length === 0 && <p className="muted">{t('personas.none')}</p>}
          {preview.set.personas.map((p) => (
            <PersonaCard key={p.name} persona={p} />
          ))}
        </div>
      )}
      <h2>{t('personas.history')}</h2>
      <Loadable resource={history}>{(data) => <History sets={data.sets} />}</Loadable>
    </section>
  );
}
