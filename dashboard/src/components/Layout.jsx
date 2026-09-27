import { useApp } from '../context.js';
import { LANGUAGES } from '../i18n/index.js';
import { BackToOrqea, BrandName, Credits } from './Brand.jsx';
import { Logo } from './Logo.jsx';
import { Select } from './Select.jsx';

export const ENVS = ['dev', 'recette', 'prod'];
export const PAGES = ['incidents', 'usage', 'funnels', 'landing', 'personas', 'settings'];

/** Header with the always-visible environment, navigation, theme and language controls. */
export function Layout({ page, onPage, onEnv, theme, onTheme, onLang, children }) {
  const { env, lang, t, orqeaUrl } = useApp();
  return (
    <div className="app">
      <header className="header">
        <div className="brand vg-hover">
          <Logo size={32} mode="hover" title="Vigie" />
          <span className="brand-text">
            <BrandName t={t} />
            <Credits t={t} orqeaUrl={orqeaUrl} />
          </span>
          <span className={`env-badge env-${env}`} data-testid="env-badge">
            {t('env.viewing', { env: t(`env.${env}`) })}
          </span>
        </div>
        <div className="controls">
          <BackToOrqea t={t} orqeaUrl={orqeaUrl} />
          <Select
            id="env"
            label={t('env.label')}
            value={env}
            options={ENVS.map((e) => ({ value: e, label: t(`env.${e}`) }))}
            onChange={onEnv}
          />
          <Select
            id="lang"
            label={t('common.language')}
            value={lang}
            options={LANGUAGES.map((l) => ({ value: l, label: t(`lang.${l}`) }))}
            onChange={onLang}
          />
          <button type="button" onClick={() => onTheme(theme === 'dark' ? 'light' : 'dark')}>
            {t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark')}
          </button>
        </div>
      </header>
      <nav className="nav" aria-label={t('nav.label')}>
        {PAGES.map((p) => (
          <button
            key={p}
            type="button"
            className={p === page ? 'tab active' : 'tab'}
            aria-current={p === page ? 'page' : undefined}
            onClick={() => onPage(p)}
          >
            {t(`nav.${p}`)}
          </button>
        ))}
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
