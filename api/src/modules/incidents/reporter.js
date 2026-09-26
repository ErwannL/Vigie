import { issuePayload } from './report.js';

/**
 * Opens or updates the incident's issue through IssueSink. A missing sink is skipped and a
 * failing sink is logged: reporting never breaks detection.
 */
export function createReporter({ repo, adapters, config, log }) {
  return async function report(incident) {
    const sink = adapters.issues.impl;
    if (sink === null) return incident;
    try {
      const payload = issuePayload(incident, config.publicUrl);
      if (incident.issueRef) {
        await sink.update(incident.issueRef, payload);
        return incident;
      }
      const { ref } = await sink.open(payload);
      return repo.update(incident.env, incident.id, { issueRef: ref });
    } catch (err) {
      log.warn({ code: err.code, incident: incident.id }, 'issue sink failed');
      return incident;
    }
  };
}
