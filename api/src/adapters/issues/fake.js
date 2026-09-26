/** In-memory IssueSink: keeps the last payload per ref so tests and the demo can inspect it. */
export function createFakeIssueSink() {
  const issues = new Map();
  return {
    issues,
    async open(payload) {
      const ref = `FAKE-${issues.size + 1}`;
      issues.set(ref, payload);
      return { ref };
    },
    async update(ref, payload) {
      issues.set(ref, payload);
    },
  };
}
