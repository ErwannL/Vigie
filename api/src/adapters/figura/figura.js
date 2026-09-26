import { bearer, expectShape, fetchJson, joinUrl } from '../http.js';

export const REPLAY_STATES = ['queued', 'running', 'reproduced', 'not_reproduced', 'failed'];

/**
 * Real Figura client for ONE target environment (dev or recette), always wrapped by
 * client.js, which refuses prod before calling it. `Authorization: Bearer <token>`
 * (VIGIE_FIGURA_TOKEN_<TARGET>).
 *   replay(scenario)  → POST {url}/api/vigie/replays          body: scenario → { runId }
 *   status(runId)     → GET  {url}/api/vigie/replays/<runId>                 → { state, evidence }
 *   pushPersonas(set) → POST {url}/api/vigie/personas         body: set      → { accepted }
 */
export function createHttpFigura({ url, token, timeoutMs, fetchImpl = globalThis.fetch }) {
  const call = (path, method, body) =>
    fetchJson(joinUrl(url, path), { method, body, timeoutMs, fetchImpl, headers: bearer(token) });
  return {
    url,
    hasToken: Boolean(token),
    timeoutMs,
    async replay(scenario) {
      const res = await call('/api/vigie/replays', 'POST', scenario);
      expectShape(typeof res?.runId === 'string' && res.runId !== '', 'figura.runId');
      return { runId: res.runId };
    },
    async status(runId) {
      const res = await call(`/api/vigie/replays/${encodeURIComponent(runId)}`, 'GET');
      expectShape(REPLAY_STATES.includes(res?.state), 'figura.state');
      return { state: res.state, evidence: res.evidence ?? null };
    },
    async pushPersonas(set) {
      const res = await call('/api/vigie/personas', 'POST', set);
      expectShape(res?.accepted !== undefined, 'figura.accepted');
      return { accepted: res.accepted };
    },
  };
}
