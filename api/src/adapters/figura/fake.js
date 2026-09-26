/**
 * In-memory Figura. A run is `queued`, then `running`, then settles on the outcome decided by
 * `decide(scenario)` (default: reproduced) on the following status calls.
 */
export function createFakeFigura({ decide = () => 'reproduced' } = {}) {
  const runs = new Map();
  const personaSets = [];
  return {
    runs,
    personaSets,
    async replay(scenario) {
      const runId = `fake-${runs.size + 1}`;
      runs.set(runId, { scenario, polls: 0 });
      return { runId };
    },
    async status(runId) {
      const run = runs.get(runId);
      if (!run) return { state: 'failed', evidence: { reason: 'unknown_run' } };
      run.polls += 1;
      if (run.polls === 1) return { state: 'running', evidence: null };
      const state = decide(run.scenario);
      return {
        state,
        evidence: { runner: 'fake-figura', steps: run.scenario.steps.length, links: [] },
      };
    },
    async pushPersonas(set) {
      personaSets.push(set);
      return { accepted: set.personas.length };
    },
  };
}
