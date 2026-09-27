import { errorKey } from '../i18n/index.js';
import { BrandedPage, Loader } from './Brand.jsx';

/**
 * Shown instead of the dashboard when there is no valid session. There is no login screen:
 * access only comes from the Orqea admin console's single sign-on handoff. While signing in,
 * the animated logo; otherwise a branded page with the way back to Orqea.
 */
export function Gate({ state, code, t, orqeaUrl }) {
  if (state === 'checking') return <Loader label={t('gate.checking')} />;
  const titles = {
    noHandoff: 'gate.noHandoff.title',
    expired: 'gate.expired.title',
    failed: 'gate.failed.title',
  };
  return (
    <BrandedPage t={t} orqeaUrl={orqeaUrl}>
      <h1>{t(titles[state])}</h1>
      <p>{t('gate.explain')}</p>
      {state === 'failed' && <p className="error">{t(errorKey(code))}</p>}
    </BrandedPage>
  );
}
