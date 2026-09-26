import { NotImplementedError } from '../../errors.js';

/**
 * Real ErrorsSource for GlitchTip / Sentry. TO BE WRITTEN BY THE INTEGRATOR.
 *
 * issues({ from, to }) must call, through ../http.js fetchJson with timeoutMs and
 * `Authorization: Bearer <token>`,
 *   GET {url}/api/0/projects/<org>/<project>/issues/?start=<from ISO>&end=<to ISO>&query=is:unresolved
 * and map each issue to { fingerprint: issue.id or its grouping hash, title (sanitised, no user
 * data), count: events in the window, firstSeen, lastSeen, route: tag "transaction" if it is a
 * route template, else null }.
 */
export function createGlitchtipErrorsSource({ url, token, timeoutMs }) {
  return {
    url,
    hasToken: token !== null,
    timeoutMs,
    async issues() {
      throw new NotImplementedError('ErrorsSource.issues (glitchtip)');
    },
  };
}
