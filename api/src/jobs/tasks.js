import { ENVS } from '../env.js';

const DAY_MS = 86400000;
const day = (date) => date.toISOString().slice(0, 10);

/**
 * The periodic work of Vigie, per environment. Each task loops over every environment and
 * passes it explicitly: no job ever works on "all environments" at once.
 */
export function createTasks({ incidents, rollupFn, eventsRepo, jtiRepo, db, config, clock, log }) {
  return {
    async detect() {
      const results = [];
      for (const env of ENVS) results.push(await incidents.runDetection(env));
      return results;
    },
    async pollReplays() {
      const results = [];
      for (const env of ENVS) results.push(await incidents.pollReplays(env));
      return results;
    },
    /** Rolls up yesterday and today, then deletes raw events past retention. */
    async retention() {
      const now = clock.now();
      const cutoff = new Date(now.getTime() - config.rawRetentionDays * DAY_MS);
      const results = [];
      for (const env of ENVS) {
        await rollupFn(db, env, day(new Date(now.getTime() - DAY_MS)), day(now));
        const deleted = await eventsRepo.deleteOlderThan(env, cutoff);
        results.push({ env, deleted });
      }
      const jti = await jtiRepo.purge(now);
      log.info({ results, jti }, 'retention done');
      return { cutoff: cutoff.toISOString(), results, jti };
    },
  };
}
