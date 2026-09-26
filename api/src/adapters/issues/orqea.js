import { bearer, expectShape, fetchJson } from '../http.js';

/**
 * Real IssueSink towards Orqea's issue board (VIGIE_ISSUES_URL, VIGIE_ISSUES_TOKEN).
 *   open(payload)        → POST {url}                              → 201 { ref }
 *   update(ref, payload) → PUT  {url}/{encodeURIComponent(ref)}    → 200
 * The payload (docs/CONTRACT.md §5) contains no user identities.
 */
export function createOrqeaIssueSink({ url, token, timeoutMs, fetchImpl = globalThis.fetch }) {
  const base = url.replace(/\/+$/, '');
  const call = (target, method, body) =>
    fetchJson(target, { method, body, timeoutMs, fetchImpl, headers: bearer(token) });
  return {
    url,
    hasToken: token !== null,
    timeoutMs,
    async open(payload) {
      const res = await call(base, 'POST', payload);
      expectShape(typeof res?.ref === 'string' && res.ref !== '', 'issues.ref');
      return { ref: res.ref };
    },
    async update(ref, payload) {
      await call(`${base}/${encodeURIComponent(ref)}`, 'PUT', payload);
    },
  };
}
