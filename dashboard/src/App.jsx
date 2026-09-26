import { useCallback, useEffect, useMemo, useState } from 'react';
import { Gate } from './components/Gate.jsx';
import { Layout } from './components/Layout.jsx';
import { AppContext } from './context.js';
import { initialLanguage, translate } from './i18n/index.js';
import { FunnelsPage } from './pages/FunnelsPage.jsx';
import { IncidentsPage } from './pages/IncidentsPage.jsx';
import { LandingPage } from './pages/LandingPage.jsx';
import { PersonasPage } from './pages/PersonasPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';
import { UsagePage } from './pages/UsagePage.jsx';
import { takeHandoff } from './sso.js';
import { clearSession, loadSession, saveSession } from './storage.js';

const PAGE_COMPONENTS = {
  incidents: IncidentsPage,
  usage: UsagePage,
  funnels: FunnelsPage,
  landing: LandingPage,
  personas: PersonasPage,
  settings: SettingsPage,
};

/** Exchanges the SSO handoff (or reuses a stored session) before showing anything. */
function useAuth({ api, location, history, session, now }) {
  const [auth, setAuth] = useState({ state: 'checking' });
  useEffect(() => {
    api.onUnauthorized(() => {
      clearSession(session);
      setAuth({ state: 'expired' });
    });
    const handoff = takeHandoff(location, history);
    if (handoff === null) {
      const stored = loadSession(session, now());
      if (stored) api.setToken(stored.token);
      setAuth({ state: stored ? 'ready' : 'noHandoff' });
      return;
    }
    api.login(handoff).then(
      (result) => {
        saveSession(session, result);
        api.setToken(result.token);
        setAuth({ state: 'ready' });
      },
      (error) => setAuth({ state: 'failed', code: error.code }),
    );
  }, [api, location, history, session, now]);
  return auth;
}

export function App({ api, location, history, session, prefs, now, navigatorLanguage }) {
  const auth = useAuth({ api, location, history, session, now });
  const [lang, setLangState] = useState(() =>
    initialLanguage(prefs.get('vigie.lang'), navigatorLanguage),
  );
  const [theme, setThemeState] = useState(() =>
    prefs.get('vigie.theme') === 'light' ? 'light' : 'dark',
  );
  const [env, setEnv] = useState('prod');
  const [page, setPage] = useState('incidents');
  const t = useCallback((key, vars) => translate(lang, key, vars), [lang]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.lang = lang;
  }, [theme, lang]);

  const setLang = (value) => {
    prefs.set('vigie.lang', value);
    setLangState(value);
  };
  const setTheme = (value) => {
    prefs.set('vigie.theme', value);
    setThemeState(value);
  };
  const context = useMemo(() => ({ api, env, lang, t }), [api, env, lang, t]);

  if (auth.state !== 'ready') return <Gate state={auth.state} code={auth.code} t={t} />;
  const Page = PAGE_COMPONENTS[page];
  return (
    <AppContext.Provider value={context}>
      <Layout
        page={page}
        onPage={setPage}
        onEnv={setEnv}
        theme={theme}
        onTheme={setTheme}
        onLang={setLang}
      >
        <Page key={env} />
      </Layout>
    </AppContext.Provider>
  );
}
