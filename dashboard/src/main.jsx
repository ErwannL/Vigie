import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import { createApi } from './api.js';
import { safeStorage } from './storage.js';
import './styles.css';

/** Browser entry point: wires real browser objects into the App. */
const api = createApi({ base: '/api', fetchImpl: (...args) => window.fetch(...args) });

createRoot(document.getElementById('root')).render(
  <App
    api={api}
    location={window.location}
    history={window.history}
    session={safeStorage(() => window.sessionStorage)}
    prefs={safeStorage(() => window.localStorage)}
    now={() => new Date()}
    navigatorLanguage={window.navigator.language}
  />,
);
