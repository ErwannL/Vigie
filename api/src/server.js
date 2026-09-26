import { buildApp, loggerOptions } from './http/app.js';
import { createContainer } from './container.js';
import { migrate } from './store/migrate.js';

/**
 * Starts the API: migrate, listen, and close cleanly on SIGTERM/SIGINT.
 * Returns `{ app, container, stop }`.
 */
export async function startApi(vars, { signals = process, logStream } = {}) {
  const container = createContainer(vars, { logStream });
  await migrate(container.db);
  const app = buildApp({
    ...container,
    logger: loggerOptions(container.config.logLevel, logStream),
  });
  await app.listen({ host: container.config.host, port: container.config.port });
  const stop = async () => {
    await app.close();
    await container.db.close();
  };
  signals.once('SIGTERM', stop);
  signals.once('SIGINT', stop);
  return { app, container, stop };
}
