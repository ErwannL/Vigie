import { assertEnv } from '../env.js';

const COLUMNS = [
  ['event_id', 'eventId'],
  ['occurred_at', 'occurredAt'],
  ['source', 'source'],
  ['type', 'type'],
  ['consent', 'consent'],
  ['visitor', 'visitor'],
  ['session', 'session'],
  ['user_id', 'user'],
  ['plan', 'plan'],
  ['seats', 'seats'],
  ['age_days', 'ageDays'],
  ['segment', 'segment'],
  ['country', 'country'],
  ['locale', 'locale'],
  ['device', 'device'],
  ['theme', 'theme'],
  ['app_version', 'appVersion'],
  ['page', 'page'],
  ['element', 'element'],
  ['feature', 'feature'],
  ['duration_ms', 'durationMs'],
  ['status', 'status'],
  ['route', 'route'],
  ['error_kind', 'errorKind'],
  ['error_fingerprint', 'errorFingerprint'],
  ['error_message', 'errorMessage'],
];

const SUBJECT_COLUMNS = COLUMNS.map(([c]) => c).join(', ');

/** Raw event storage. Every function takes the environment first; none can omit it. */
export function createEventsRepo(db) {
  return {
    /** Idempotent on (env, eventId): replays of a batch insert nothing new. */
    async insert(env, rows) {
      assertEnv(env);
      if (rows.length === 0) return 0;
      const params = [env];
      const tuples = rows.map((row) => {
        const holders = COLUMNS.map(([, key]) => {
          params.push(row[key]);
          return `$${params.length}`;
        });
        return `($1, ${holders.join(', ')})`;
      });
      const sql = `INSERT INTO events (env, ${SUBJECT_COLUMNS}) VALUES ${tuples.join(', ')}
        ON CONFLICT (env, event_id) DO NOTHING`;
      return (await db.query(sql, params)).rowCount;
    },

    async forSubject(env, user) {
      assertEnv(env);
      const { rows } = await db.query(
        `SELECT ${SUBJECT_COLUMNS} FROM events WHERE env = $1 AND user_id = $2 ORDER BY occurred_at`,
        [env, user],
      );
      return rows;
    },

    async deleteSubject(env, user) {
      assertEnv(env);
      return (await db.query('DELETE FROM events WHERE env = $1 AND user_id = $2', [env, user]))
        .rowCount;
    },

    async deleteOlderThan(env, cutoff) {
      assertEnv(env);
      return (
        await db.query('DELETE FROM events WHERE env = $1 AND occurred_at < $2', [env, cutoff])
      ).rowCount;
    },

    async countAnalytics(env, from, to) {
      assertEnv(env);
      const { rows } = await db.query(
        `SELECT count(*) AS n FROM events
         WHERE env = $1 AND consent = 'analytics' AND occurred_at >= $2 AND occurred_at < $3`,
        [env, from, to],
      );
      return rows[0].n;
    },
  };
}
