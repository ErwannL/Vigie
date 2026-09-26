import { assertEnv } from '../../env.js';

/**
 * Builds the SQL condition selecting the events behind one incident: by route, else by error
 * fingerprint, else by page + element. Parameters are numbered from `offset`.
 */
export function filterSql(filter, offset) {
  if (filter.route) return { sql: `route = $${offset}`, params: [filter.route] };
  if (filter.fingerprint)
    return { sql: `error_fingerprint = $${offset}`, params: [filter.fingerprint] };
  return {
    sql: `page = $${offset} AND element = $${offset + 1}`,
    params: [filter.page, filter.element],
  };
}

/** p95 latency and sample count per route template. */
async function routeLatency(db, env, from, to) {
  assertEnv(env);
  const { rows } = await db.query(
    `SELECT route, count(*) AS n,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95
     FROM events
     WHERE env = $1 AND occurred_at >= $2 AND occurred_at < $3
       AND route IS NOT NULL AND duration_ms IS NOT NULL
     GROUP BY route`,
    [env, from, to],
  );
  return rows;
}

/** Error events per fingerprint (and the route or page they happened on). */
async function errorCounts(db, env, from, to) {
  assertEnv(env);
  const { rows } = await db.query(
    `SELECT error_fingerprint AS fingerprint, max(route) AS route, max(page) AS page,
            count(*) AS count
     FROM events
     WHERE env = $1 AND occurred_at >= $2 AND occurred_at < $3
       AND type IN ('client_error', 'server_error') AND error_fingerprint IS NOT NULL
     GROUP BY error_fingerprint`,
    [env, from, to],
  );
  return rows;
}

/** Sessions with 4+ clicks on the same element within 10 seconds. */
async function rageClicks(db, env, from, to) {
  assertEnv(env);
  const { rows } = await db.query(
    `SELECT page, element, count(DISTINCT session) AS sessions FROM (
       SELECT session, page, element, occurred_at,
              lag(occurred_at, 3) OVER (PARTITION BY session, element ORDER BY occurred_at) AS prev3
       FROM events
       WHERE env = $1 AND occurred_at >= $2 AND occurred_at < $3 AND type = 'click'
         AND element IS NOT NULL AND session IS NOT NULL
     ) t
     WHERE prev3 IS NOT NULL AND occurred_at - prev3 <= interval '10 seconds'
     GROUP BY page, element`,
    [env, from, to],
  );
  return rows;
}

/** Per fingerprint: sessions that hit it, and those whose last event came ≤ 30 s later. */
async function quickExits(db, env, from, to) {
  assertEnv(env);
  const { rows } = await db.query(
    `WITH errs AS (
       SELECT session, error_fingerprint AS fingerprint, route, page, occurred_at
       FROM events
       WHERE env = $1 AND occurred_at >= $2 AND occurred_at < $3::timestamptz - interval '30 seconds'
         AND type IN ('client_error', 'server_error')
         AND session IS NOT NULL AND error_fingerprint IS NOT NULL
     ), last AS (
       SELECT session, max(occurred_at) AS last_at FROM events
       WHERE env = $1 AND occurred_at >= $2 AND session IN (SELECT session FROM errs)
       GROUP BY session
     )
     SELECT e.fingerprint, max(e.route) AS route, max(e.page) AS page,
            count(DISTINCT e.session) AS error_sessions,
            count(DISTINCT e.session) FILTER (
              WHERE l.last_at - e.occurred_at <= interval '30 seconds') AS exits
     FROM errs e JOIN last l USING (session)
     GROUP BY e.fingerprint`,
    [env, from, to],
  );
  return rows;
}

/** Who is affected: event counts per device, plan, feature and app version. */
async function profile(db, env, filter, from, to) {
  assertEnv(env);
  const f = filterSql(filter, 4);
  const { rows } = await db.query(
    `SELECT CASE WHEN GROUPING(device) = 0 THEN 'device'
                 WHEN GROUPING(plan) = 0 THEN 'plan'
                 WHEN GROUPING(feature) = 0 THEN 'feature'
                 ELSE 'app_version' END AS dim,
            COALESCE(device, plan, feature, app_version) AS value,
            count(*) AS n, min(occurred_at) AS first_at
     FROM events
     WHERE env = $1 AND occurred_at >= $2 AND occurred_at < $3 AND ${f.sql}
     GROUP BY GROUPING SETS ((device), (plan), (feature), (app_version))`,
    [env, from, to, ...f.params],
  );
  return rows;
}

/** App versions seen for the incident's events before the detection window. */
async function versionsBefore(db, env, filter, from, to) {
  assertEnv(env);
  const f = filterSql(filter, 4);
  const { rows } = await db.query(
    `SELECT DISTINCT app_version FROM events
     WHERE env = $1 AND occurred_at >= $2 AND occurred_at < $3
       AND app_version IS NOT NULL AND ${f.sql}`,
    [env, from, to, ...f.params],
  );
  return rows.map((r) => r.app_version);
}

/**
 * Navigation steps preceding the first hit, for up to 500 sessions that hit the incident.
 * Only catalogue keys and templates are selected, never ids or messages.
 */
async function pathsBefore(db, env, filter, from, to) {
  assertEnv(env);
  const f = filterSql(filter, 4);
  const { rows } = await db.query(
    `WITH hit AS (
       SELECT session, min(occurred_at) AS first_hit FROM events
       WHERE env = $1 AND occurred_at >= $2 AND occurred_at < $3
         AND session IS NOT NULL AND ${f.sql}
       GROUP BY session ORDER BY session LIMIT 500
     )
     SELECT e.session, e.type, e.page, e.feature, e.element
     FROM events e JOIN hit h ON h.session = e.session
     WHERE e.env = $1 AND e.occurred_at >= $2::timestamptz - interval '1 hour'
       AND e.occurred_at < h.first_hit
       AND e.type IN ('page_view', 'feature_use', 'click', 'login', 'signup')
     ORDER BY e.session, e.occurred_at`,
    [env, from, to, ...f.params],
  );
  return rows;
}

const QUERIES = {
  routeLatency,
  errorCounts,
  rageClicks,
  quickExits,
  profile,
  versionsBefore,
  pathsBefore,
};

/** SQL for Module 1. Every query is scoped to one environment and one time window. */
export function createIncidentQueries(db) {
  return Object.fromEntries(
    Object.entries(QUERIES).map(([name, query]) => [name, (...args) => query(db, ...args)]),
  );
}
