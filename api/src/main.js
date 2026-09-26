import { startApi } from './server.js';

/** API process entry point (`npm start`). */
export const running = startApi(process.env);
