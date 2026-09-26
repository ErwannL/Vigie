import { AppError } from '../errors.js';
import { validateEvent } from './validate.js';

export const MAX_EVENTS_PER_BATCH = 500;
export const MAX_BATCH_BYTES = 1024 * 1024;

/**
 * Validates a batch event by event and stores the valid ones. One bad event never rejects
 * the batch; replaying a batch is harmless (idempotent on eventId).
 */
export function createCollector({ eventsRepo, config, clock }) {
  return {
    async ingest(env, body) {
      const list = body?.events;
      if (!Array.isArray(list)) throw new AppError('invalid_batch', 400);
      if (list.length > MAX_EVENTS_PER_BATCH) throw new AppError('too_many_events', 400);
      const now = clock.now();
      const rows = [];
      const rejected = [];
      list.forEach((event, index) => {
        const result = validateEvent(event, { env, now, retentionDays: config.rawRetentionDays });
        if (result.ok) rows.push(result.row);
        else rejected.push({ index, code: result.code });
      });
      await eventsRepo.insert(env, rows);
      return { accepted: rows.length, rejected };
    },
  };
}
