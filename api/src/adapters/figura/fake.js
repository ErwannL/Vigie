const RUN_ID = /^fake\.(reproduced|not_reproduced|failed)\.(\d+)\.(\d+)$/;

/**
 * Stateless fake Figura: the outcome decided by `decide(scenario)` (default: reproduced),
 * the start time and the step count are encoded in the run id, so the API process (which
 * starts runs) and the jobs process (which polls them) agree without sharing memory.
 * A run is `running` for `runningMs`, then settles on its outcome.
 */
export function createFakeFigura({ clock, decide = () => 'reproduced', runningMs = 20000 }) {
  const personaSets = [];
  return {
    personaSets,
    async replay(scenario) {
      const outcome = decide(scenario);
      return { runId: `fake.${outcome}.${clock.now().getTime()}.${scenario.steps.length}` };
    },
    async status(runId) {
      const match = RUN_ID.exec(runId);
      if (!match) return { state: 'failed', evidence: { reason: 'unknown_run' } };
      const [, outcome, startedAt, steps] = match;
      if (clock.now().getTime() - Number(startedAt) < runningMs) {
        return { state: 'running', evidence: null };
      }
      return {
        state: outcome,
        evidence: { runner: 'fake-figura', steps: Number(steps), links: [] },
      };
    },
    async pushPersonas(set) {
      personaSets.push(set);
      return { accepted: set.personas.length };
    },
  };
}
