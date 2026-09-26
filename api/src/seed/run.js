import { createContainer } from '../container.js';
import { migrate } from '../store/migrate.js';
import { seedDemo } from './demo.js';

/** VIGIE_SEED_SCALE multiplies the dataset size (default 1 ≈ 3,400 visitors, 140k events). */
export function seedScale(vars) {
  const n = Number.parseFloat(vars.VIGIE_SEED_SCALE);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** `npm run seed:demo`: migrate, then load the demo dataset and print a summary. */
export async function runSeed(vars, { out = process.stdout } = {}) {
  const container = createContainer(vars);
  try {
    await migrate(container.db);
    const summary = await seedDemo(container, { scale: seedScale(vars) });
    out.write(`${JSON.stringify(summary, null, 2)}\n`);
    return summary;
  } finally {
    await container.db.close();
  }
}
