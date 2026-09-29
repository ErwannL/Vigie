import { Logo } from './Logo.jsx';

/**
 * Branding shared by every screen, one source of truth (same set as SportSplitter and Archipel
 * by Orqea): « Vigie by Orqea », credits, « Back to Orqea », loader and 404. The Orqea link is
 * the one of THIS environment (`VIGIE_ORQEA_URL`, learnt from `/api/healthz`).
 */
export const DEFAULT_ORQEA_URL = 'https://orqea.dev';
export const AUTHOR = Object.freeze({
  name: 'Erwann Laplante',
  href: 'https://github.com/ErwannL',
});

/** « Vigie » + « by Orqea ». */
export function BrandName({ t }) {
  return (
    <span className="brand-name">
      Vigie <span className="by">{t('brand.byline')}</span>
    </span>
  );
}

/** « Powered by Orqea » (same tab, leaves the iframe) and « Developed by … » (new tab). */
export function Credits({ t, orqeaUrl }) {
  return (
    <span className="credits">
      <a href={orqeaUrl} target="_top" data-credit="owner">
        {t('brand.poweredBy')}
      </a>
      <a
        href={AUTHOR.href}
        target="_blank"
        rel="noreferrer noopener"
        aria-label={t('brand.authorNewTab', { name: AUTHOR.name })}
        data-credit="author"
      >
        {t('brand.author', { name: AUTHOR.name })}
      </a>
    </span>
  );
}

/** « ← Back to Orqea »: the session comes from Orqea, so there is no logout, we go back. */
export function BackToOrqea({ t, orqeaUrl }) {
  return (
    <a className="back" href={orqeaUrl} target="_top">
      {t('brand.back')}
    </a>
  );
}

/** Full-page loader: the animated logo, never a spinner. */
export function Loader({ label }) {
  return (
    <div className="loader" role="status">
      <Logo size={56} mode="loop" />
      <span>{label}</span>
    </div>
  );
}

/** A branded full page (gate, 404): logo, name, content, way back, credits. */
export function BrandedPage({ t, orqeaUrl, children }) {
  return (
    <div className="gate">
      <Logo size={64} mode="hover" title="Vigie" />
      <p className="gate-name">
        <BrandName t={t} />
      </p>
      {children}
      <p>
        <BackToOrqea t={t} orqeaUrl={orqeaUrl} />
      </p>
      <Credits t={t} orqeaUrl={orqeaUrl} />
    </div>
  );
}

/** Any path other than `/` (nginx serves the SPA for every path): a branded 404. */
export function NotFound({ t, orqeaUrl }) {
  return (
    <BrandedPage t={t} orqeaUrl={orqeaUrl}>
      <h1>{t('notFound.title')}</h1>
      <p>{t('notFound.hint')}</p>
    </BrandedPage>
  );
}
