import { activityLevel, seatBucket, tenure } from '../../catalogues.js';
import { mask } from './kanon.js';

/**
 * One row per signed-in account (no id is selected): its latest plan, seats and age, and
 * its number of distinct active days in the window.
 */
export async function accountRows(db, env, from, to) {
  const { rows } = await db.query(
    `SELECT (array_agg(plan ORDER BY occurred_at DESC) FILTER (WHERE plan IS NOT NULL))[1] AS plan,
            (array_agg(seats ORDER BY occurred_at DESC) FILTER (WHERE seats IS NOT NULL))[1] AS seats,
            (array_agg(age_days ORDER BY occurred_at DESC) FILTER (WHERE age_days IS NOT NULL))[1]
              AS age_days,
            count(DISTINCT (occurred_at AT TIME ZONE 'UTC')::date) AS active_days
     FROM events
     WHERE env = $1 AND consent = 'analytics' AND user_id IS NOT NULL
       AND occurred_at >= $2 AND occurred_at < $3
     GROUP BY user_id`,
    [env, from, to],
  );
  return rows;
}

/** Buckets accounts into segments; only aggregated, k-masked counts come out. */
export function segmentsView(rows) {
  const accounts = rows.map((r) => ({
    plan: r.plan ?? 'unknown',
    seats: seatBucket(r.seats) ?? 'unknown',
    tenure: tenure(r.age_days) ?? 'unknown',
    activity: activityLevel(r.age_days, r.active_days),
  }));
  const tally = (keyOf) => {
    const counts = new Map();
    for (const a of accounts) counts.set(keyOf(a), (counts.get(keyOf(a)) ?? 0) + 1);
    return counts;
  };
  const dims = ['plan', 'seats', 'tenure', 'activity'];
  const byDimension = Object.fromEntries(
    dims.map((d) => [
      d,
      [...tally((a) => a[d]).entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([value, n]) => ({ value, accounts: mask(n) })),
    ]),
  );
  const segments = [...tally((a) => dims.map((d) => a[d]).join('|')).entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, n]) => {
      const [plan, seats, tenureValue, activity] = key.split('|');
      return { plan, seats, tenure: tenureValue, activity, accounts: mask(n) };
    });
  return { accounts: mask(accounts.length), byDimension, segments };
}
