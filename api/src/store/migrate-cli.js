import { runMigrations } from './run-migrations.js';

/** `npm run migrate` entry point. */
export const running = runMigrations(process.env);
