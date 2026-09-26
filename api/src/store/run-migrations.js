import { loadConfig } from '../config.js';
import { createDb } from './db.js';
import { migrate } from './migrate.js';

/** Applies pending migrations and closes the pool (`npm run migrate`). */
export async function runMigrations(vars) {
  const db = createDb({ connectionString: loadConfig(vars).databaseUrl });
  try {
    return await migrate(db);
  } finally {
    await db.close();
  }
}
