import { ENVS } from '../env.js';
import { rollup } from '../jobs/rollup.js';
import { generateDemo } from './plants.js';

const BATCH = 500;
const DAY = 86400000;

/**
 * Loads the demo dataset through the real collector (so every event passes validation),
 * rolls up daily aggregates and runs one detection pass per environment.
 */
export async function seedDemo(container, { scale = 1 } = {}) {
  const now = container.clock.now();
  const data = generateDemo(now, { scale });
  const summary = {};
  for (const env of ENVS) {
    let accepted = 0;
    const rejected = {};
    for (let i = 0; i < data[env].length; i += BATCH) {
      const result = await container.collector.ingest(env, { events: data[env].slice(i, i + BATCH) });
      accepted += result.accepted;
      for (const r of result.rejected) rejected[r.code] = (rejected[r.code] ?? 0) + 1;
    }
    const from = new Date(now.getTime() - 40 * DAY).toISOString().slice(0, 10);
    await rollup(container.db, env, from, now.toISOString().slice(0, 10));
    const detection = await container.services.incidents.runDetection(env);
    summary[env] = { accepted, rejected, incidents: detection.incidents.length };
  }
  return summary;
}
