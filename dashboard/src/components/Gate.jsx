import { errorKey } from '../i18n/index.js';

/**
 * Shown instead of the dashboard when there is no valid session. There is no login screen:
 * access only comes from the Orqea admin console's single sign-on handoff.
 */
export function Gate({ state, code, t }) {
  const titles = {
    checking: 'gate.checking',
    noHandoff: 'gate.noHandoff.title',
    expired: 'gate.expired.title',
    failed: 'gate.failed.title',
  };
  return (
    <div className="gate">
      <h1>{t(titles[state])}</h1>
      {state !== 'checking' && <p>{t('gate.explain')}</p>}
      {state === 'failed' && <p className="error">{t(errorKey(code))}</p>}
    </div>
  );
}
