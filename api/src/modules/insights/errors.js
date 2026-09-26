import { mask, safeRate } from './kanon.js';

/**
 * Errors experienced per plan and per device, from all consents (Module 1 data). Sessions
 * stand in for people for k-anonymity: a group seen in fewer than k sessions is masked.
 */
export async function errorsBySegment(db, env, from, to) {
  const { rows } = await db.query(
    `SELECT CASE WHEN GROUPING(plan) = 0 THEN 'plan' ELSE 'device' END AS dimension,
            coalesce(plan, device, 'unknown') AS value,
            count(DISTINCT session) AS sessions,
            count(DISTINCT session) FILTER (WHERE type IN ('client_error', 'server_error'))
              AS error_sessions,
            count(*) FILTER (WHERE type IN ('client_error', 'server_error')) AS errors
     FROM events
     WHERE env = $1 AND session IS NOT NULL AND occurred_at >= $2 AND occurred_at < $3
     GROUP BY GROUPING SETS ((plan), (device))`,
    [env, from, to],
  );
  return rows;
}

export function errorsView(rows) {
  const view = { plan: [], device: [] };
  for (const r of rows) {
    const sessions = mask(r.sessions);
    view[r.dimension].push({
      value: r.value,
      sessions,
      errors: sessions.masked ? null : r.errors,
      errorSessionRate: safeRate(r.error_sessions, r.sessions),
    });
  }
  for (const list of Object.values(view)) list.sort((a, b) => (a.value < b.value ? -1 : 1));
  return view;
}
