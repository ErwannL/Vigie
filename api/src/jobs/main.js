import { startJobs } from './runner.js';

/** Jobs process entry point (`npm run jobs`). */
export const running = startJobs(process.env);
