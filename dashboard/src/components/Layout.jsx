import { useApp } from '../context.js';
import { LANGUAGES } from '../i18n/index.js';
import { Select } from './Select.jsx';

export const ENVS = ['dev', 'recette', 'prod'];
export const PAGES = ['incidents', 'usage', 'funnels', 'landing', 'personas', 'settings'];

/** Header with the always-visible environment, navigation, theme and language controls. */
export function Layout({ page, onPage, onEnv, theme, onTheme, onLang, children }) {
  const { env, lang, t } = useApp();
  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            ◈
          </span>
          <span>Vigie</span>
          <span className={`env-badge env-${env}`} data-testid="env-badge">
            {t('env.viewing', { env: t(`env.${env}`) })}
          </span>
        </div>
        <div className="controls">
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
