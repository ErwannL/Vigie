import { NotImplementedError } from '../../errors.js';

/**
 * Real Figura client for ONE target environment (dev or recette). TO BE WRITTEN BY THE
 * INTEGRATOR. It is always wrapped by client.js, which refuses prod before calling it.
 *
 * All calls go through ../http.js fetchJson with timeoutMs:
 *   replay(scenario)  → POST {url}/v1/scenarios          body: scenario  → { runId }
 *   status(runId)     → GET  {url}/v1/runs/<runId>                    → { state, evidence }
 *   pushPersonas(set) → POST {url}/v1/persona-sets       body: set       → { accepted }
 * Figura's actual paths are not known to Vigie; align them with the Figura team.
 */
export function createHttpFigura({ url, timeoutMs }) {
  const fail = (what) => {
    throw new NotImplementedError(what);
  };
  return {
    url,
    timeoutMs,
    replay: async () => fail('FiguraClient.replay'),
    status: async () => fail('FiguraClient.status'),
    pushPersonas: async () => fail('FiguraClient.pushPersonas'),
  };
}
