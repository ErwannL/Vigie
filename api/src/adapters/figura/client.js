import { assertFiguraTarget } from '../../env.js';
import { AppError } from '../../errors.js';

/**
 * FiguraClient, the only way Vigie reaches Figura.
 *   replay(scenario)  → { runId }
 *   status(runId)     → { state: queued|running|reproduced|not_reproduced|failed, evidence }
 *   pushPersonas(set) → { accepted }
 *
 * It refuses any targetEnv other than dev or recette BEFORE touching an implementation:
 * Figura never runs against prod, and there is no option to change that.
 * `runId`s are prefixed with the target (`recette:abc`) so status() knows where to ask.
 */
export function createFiguraClient(targets) {
  function implFor(targetEnv) {
    assertFiguraTarget(targetEnv);
    const impl = targets[targetEnv];
    if (!impl) throw new AppError('figura_not_configured', 503, { targetEnv });
    return impl;
  }

  return {
    async replay(scenario) {
      const { runId } = await implFor(scenario.targetEnv).replay(scenario);
      return { runId: `${scenario.targetEnv}:${runId}` };
    },
    async status(runId) {
      const [targetEnv, inner] = String(runId).split(/:(.*)/s);
      return implFor(targetEnv).status(inner);
    },
    async pushPersonas(set) {
      return implFor(set.targetEnv).pushPersonas(set);
    },
  };
}
