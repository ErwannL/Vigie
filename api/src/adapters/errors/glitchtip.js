import { isTemplate, looksSensitive } from '../../collector/sanitize.js';
import { bearer, expectShape, fetchJson, joinUrl } from '../http.js';

const PROJECT = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/** `org/project` as written in VIGIE_ERRORS_PROJECT_<ENV>, or null when malformed. */
export function parseProject(value) {
  return typeof value === 'string' && PROJECT.test(value) ? value : null;
}

/** An issue title that looks like it carries user data is replaced by its error type. */
function safeTitle(issue) {
  const title = typeof issue.title === 'string' ? issue.title.slice(0, 200) : '';
  if (title !== '' && !looksSensitive(title)) return title;
  return typeof issue.metadata?.type === 'string' ? issue.metadata.type : 'error';
}

/** One Sentry-API issue → ErrorsSource entry. `route` only when `culprit` is a template. */
export function mapIssue(issue) {
  return {
    fingerprint: String(issue.id ?? issue.shortId),
    title: safeTitle(issue),
    count: Number(issue.count) || 0,
    firstSeen: issue.firstSeen,
    lastSeen: issue.lastSeen,
    route: isTemplate(issue.culprit) ? issue.culprit : null,
  };
}

/**
 * Real ErrorsSource for GlitchTip / Sentry (same API). `project` is `org/project`.
 *   GET {url}/api/0/projects/<org>/<project>/issues/?start=<ISO>&end=<ISO>&query=is:unresolved
 * with `Authorization: Bearer <token>`. With start/end the API counts events in the window.
 */
export function createGlitchtipErrorsSource({
  url,
  token,
  project,
  timeoutMs,
  fetchImpl = globalThis.fetch,
}) {
  return {
    url,
    hasToken: token !== null,
    project,
    timeoutMs,
    async issues({ from, to }) {
      const params = new URLSearchParams({
        start: from.toISOString(),
        end: to.toISOString(),
        query: 'is:unresolved',
        limit: '100',
      });
      const body = await fetchJson(joinUrl(url, `/api/0/projects/${project}/issues/?${params}`), {
        timeoutMs,
        fetchImpl,
        headers: bearer(token),
      });
      expectShape(Array.isArray(body), 'errors.issues');
      return body.map(mapIssue);
    },
  };
}
