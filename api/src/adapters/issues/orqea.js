import { NotImplementedError } from '../../errors.js';

/**
 * Real IssueSink towards Orqea's issue board. TO BE WRITTEN BY THE INTEGRATOR.
 *
 *   open(payload)        → POST  {url}/internal/vigie/issues        → { ref }
 *   update(ref, payload) → PATCH {url}/internal/vigie/issues/<ref>
 * with `Authorization: Bearer <token>`, through ../http.js fetchJson with timeoutMs.
 * The payload (see issuePayload in modules/incidents/report.js and docs/CONTRACT.md §4.4)
 * contains no user identities. Orqea turns it into a card on its issue board.
 */
export function createOrqeaIssueSink({ url, token, timeoutMs }) {
  const fail = (what) => {
    throw new NotImplementedError(what);
  };
  return {
    url,
    hasToken: token !== null,
    timeoutMs,
    open: async () => fail('IssueSink.open'),
    update: async () => fail('IssueSink.update'),
  };
}
