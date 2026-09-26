import { createContainer } from '../container.js';
import { migrate } from '../store/migrate.js';
import { seedDemo } from './demo.js';

/** `npm run seed:demo`: migrate, then load the demo dataset and print a summary. */
export async function runSeed(vars, { out = process.stdout, scale = 1 } = {}) {
  const container = createContainer(vars);
  try {
    await migrate(container.db);
    const summary = await seedDemo(container, { scale });
    out.write(`${JSON.stringify(summary, null, 2)}\n`);
    return summary;
  } finally {
    await container.db.close();
  }
}

export const running = runSeed(process.env);
