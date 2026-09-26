import { assertEnv } from '../env.js';

/**
 * Daily aggregates, kept after raw events are deleted. Recomputes whole UTC days in
 * [fromDay, toDay] and upserts them, so running it twice is harmless.
 */
export async function rollup(db, env, fromDay, toDay) {
  assertEnv(env);
  const day = `(occurred_at AT TIME ZONE 'UTC')::date`;
  const routes = await db.query(
    `INSERT INTO daily_route_stats (env, day, route, requests, errors, p50_ms, p95_ms)
     SELECT env, ${day}, route, count(*),
            count(*) FILTER (WHERE status >= 500 OR type = 'server_error'),
            percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms),
            percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)
     FROM events
     WHERE env = $1 AND route IS NOT NULL AND ${day} >= $2::date AND ${day} <= $3::date
     GROUP BY env, ${day}, route
     ON CONFLICT (env, day, route) DO UPDATE SET requests = EXCLUDED.requests,
       errors = EXCLUDED.errors, p50_ms = EXCLUDED.p50_ms, p95_ms = EXCLUDED.p95_ms`,
    [env, fromDay, toDay],
  );
  const features = await db.query(
    `INSERT INTO daily_feature_usage (env, day, feature, users, uses)
     SELECT env, ${day}, feature, count(DISTINCT coalesce(user_id, visitor)), count(*)
     FROM events
     WHERE env = $1 AND consent = 'analytics' AND type = 'feature_use' AND feature IS NOT NULL
       AND ${day} >= $2::date AND ${day} <= $3::date
     GROUP BY env, ${day}, feature
     ON CONFLICT (env, day, feature) DO UPDATE SET users = EXCLUDED.users, uses = EXCLUDED.uses`,
    [env, fromDay, toDay],
  );
  return { routes: routes.rowCount, features: features.rowCount };
}

/** Side-by-side latency of one route across environments: never merged into one total. */
export async function compareRoute(db, envs, route, fromDay) {
  envs.forEach(assertEnv);
  const { rows } = await db.query(
    `SELECT env, day, requests, errors, p50_ms, p95_ms FROM daily_route_stats
     WHERE env = ANY($1) AND route = $2 AND day >= $3 ORDER BY env, day`,
    [envs, route, fromDay],
  );
  return Object.fromEntries(
    envs.map((env) => [
      env,
      rows.filter((r) => r.env === env).map(({ env: _env, ...rest }) => rest),
    ]),
  );
}

/** Route templates known in the aggregates of one environment. */
export async function knownRoutes(db, env) {
  assertEnv(env);
  const { rows } = await db.query(
    'SELECT DISTINCT route FROM daily_route_stats WHERE env = $1 ORDER BY route',
    [env],
  );
  return rows.map((r) => r.route);
}
