import { errorKey } from '../i18n/index.js';
import { useApp } from '../context.js';

export function Loading() {
  const { t } = useApp();
  return (
    <p className="muted" role="status">
      {t('common.loading')}
    </p>
  );
}

/** Shows a translated message for an API error code; never the raw server message. */
export function ErrorMessage({ error }) {
  const { t } = useApp();
  return (
    <p className="error" role="alert">
      {t(errorKey(error.code))}
    </p>
  );
}

/** Renders a resource: loading, error, or `children(data)`. */
export function Loadable({ resource, children }) {
  if (resource.status === 'error') return <ErrorMessage error={resource.error} />;
  if (resource.data === null) return <Loading />;
  return children(resource.data);
}

/** Module 2 empty state: no analytics-consent events yet, so no behavioural charts. */
export function NoAnalytics() {
  const { t } = useApp();
  return (
    <div className="notice" role="note">
      <strong>{t('noAnalytics.title')}</strong>
      <p>{t('noAnalytics.body')}</p>
    </div>
  );
}
