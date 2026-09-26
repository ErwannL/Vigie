/**
 * Fake IssueSink. The ref is derived from the incident (`FAKE-prod-12`), so the API and jobs
 * processes produce the same ref without sharing memory. Payloads are kept per process for
 * tests and inspection.
 */
export function createFakeIssueSink() {
  const issues = new Map();
  return {
    issues,
    async open(payload) {
      const ref = `FAKE-${payload.env}-${payload.incidentId}`;
      issues.set(ref, payload);
      return { ref };
    },
    async update(ref, payload) {
      issues.set(ref, payload);
    },
  };
}
