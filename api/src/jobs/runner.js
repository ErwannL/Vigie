import { createContainer } from '../container.js';
import { migrate } from '../store/migrate.js';
import { rollup } from './rollup.js';
import { createScheduler } from './scheduler.js';
import { createTasks } from './tasks.js';

export const POLL_EVERY_MS = 30000;
export const RETENTION_EVERY_MS = 3600000;

/**
 * Jobs process: detection, replay polling and retention on injectable timers.
 * Returns `{ scheduler, tasks, container, stop }`.
 */
export async function startJobs(vars, { signals = process, timers = globalThis, logStream } = {}) {
  const container = createContainer(vars, { logStream });
  await migrate(container.db);
  const tasks = createTasks({
    incidents: container.services.incidents,
    rollupFn: rollup,
    eventsRepo: container.repos.events,
    jtiRepo: container.repos.jti,
    db: container.db,
    config: container.config,
    clock: container.clock,
    log: container.log,
  });
  const scheduler = createScheduler({
    setTimer: (fn, ms) => timers.setTimeout(fn, ms),
    clearTimer: (handle) => timers.clearTimeout(handle),
    log: container.log,
  });
  scheduler.schedule('detect', container.config.detect.intervalSeconds * 1000, tasks.detect);
  scheduler.schedule('poll-replays', POLL_EVERY_MS, tasks.pollReplays);
  scheduler.schedule('retention', RETENTION_EVERY_MS, tasks.retention);
  const stop = async () => {
    scheduler.stop();
    await container.db.close();
  };
  signals.once('SIGTERM', stop);
  signals.once('SIGINT', stop);
  return { scheduler, tasks, container, stop };
}
