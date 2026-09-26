import { FEATURES, K_ANONYMITY } from '../../catalogues.js';
import { mask, safeRate } from './kanon.js';

const DAY_MS = 86400000;
/** A feature used by less than this share of active users counts as "rarely used". */
export const RARE_SHARE = 0.05;

const SUBJECT = 'coalesce(user_id, visitor)';

export async function featureCounts(db, env, from, to) {
  const { rows } = await db.query(
    `SELECT feature, count(*) AS uses, count(DISTINCT ${SUBJECT}) AS users,
       count(DISTINCT ${SUBJECT}) FILTER (WHERE occurred_at >= $3::timestamptz - interval '1 day') AS dau,
       count(DISTINCT ${SUBJECT}) FILTER (WHERE occurred_at >= $3::timestamptz - interval '7 days') AS wau,
       count(DISTINCT ${SUBJECT}) FILTER (
         WHERE occurred_at >= $3::timestamptz - interval '14 days'
           AND occurred_at < $3::timestamptz - interval '7 days') AS prev_wau
     FROM events
     WHERE env = $1 AND consent = 'analytics' AND type = 'feature_use' AND feature IS NOT NULL
       AND occurred_at >= $2 AND occurred_at < $3
     GROUP BY feature`,
    [env, from, to],
  );
  return rows;
}

export async function activeUsers(db, env, from, to) {
  const { rows } = await db.query(
    `SELECT count(DISTINCT ${SUBJECT}) AS n FROM events
     WHERE env = $1 AND consent = 'analytics' AND source = 'app' AND ${SUBJECT} IS NOT NULL
       AND occurred_at >= $2 AND occurred_at < $3`,
    [env, from, to],
  );
  return rows[0].n;
}

export async function featureByPlan(db, env, from, to) {
  const { rows } = await db.query(
    `SELECT feature, coalesce(plan, 'none') AS plan, count(DISTINCT ${SUBJECT}) AS users
     FROM events
     WHERE env = $1 AND consent = 'analytics' AND type = 'feature_use' AND feature IS NOT NULL
       AND occurred_at >= $2 AND occurred_at < $3
     GROUP BY feature, coalesce(plan, 'none')`,
    [env, from, to],
  );
  return rows;
}

/**
 * Per feature, users with/without it among signed-in users: how many were active early in the
 * window and came back in its last 7 days (retention), and how many upgraded.
 */
export async function featureOutcomes(db, env, from, to) {
  const { rows } = await db.query(
    `WITH u AS (
       SELECT user_id,
              bool_or(occurred_at < $3::timestamptz - interval '7 days') AS early,
              bool_or(occurred_at >= $3::timestamptz - interval '7 days') AS late,
              bool_or(type = 'upgrade') AS upgraded
       FROM events
       WHERE env = $1 AND consent = 'analytics' AND user_id IS NOT NULL
         AND occurred_at >= $2 AND occurred_at < $3
       GROUP BY user_id
     ), f AS (
       SELECT DISTINCT user_id, feature FROM events
       WHERE env = $1 AND consent = 'analytics' AND user_id IS NOT NULL AND type = 'feature_use'
         AND feature IS NOT NULL AND occurred_at >= $2 AND occurred_at < $3
     ), feats AS (SELECT DISTINCT feature FROM f)
     SELECT feats.feature,
       count(*) FILTER (WHERE f.user_id IS NOT NULL) AS users_with,
       count(*) FILTER (WHERE f.user_id IS NOT NULL AND u.early) AS early_with,
       count(*) FILTER (WHERE f.user_id IS NOT NULL AND u.early AND u.late) AS retained_with,
       count(*) FILTER (WHERE f.user_id IS NOT NULL AND u.upgraded) AS upgraded_with,
       count(*) FILTER (WHERE f.user_id IS NULL) AS users_without,
       count(*) FILTER (WHERE f.user_id IS NULL AND u.early) AS early_without,
       count(*) FILTER (WHERE f.user_id IS NULL AND u.early AND u.late) AS retained_without,
       count(*) FILTER (WHERE f.user_id IS NULL AND u.upgraded) AS upgraded_without
     FROM feats CROSS JOIN u
     LEFT JOIN f ON f.user_id = u.user_id AND f.feature = feats.feature
     GROUP BY feats.feature`,
    [env, from, to],
  );
  return rows;
}

export async function dailyUsage(db, env, fromDay, toDay) {
  const { rows } = await db.query(
    `SELECT day, feature, users FROM daily_feature_usage
     WHERE env = $1 AND day >= $2 AND day <= $3 ORDER BY day, feature`,
    [env, fromDay, toDay],
  );
  return rows;
}

function lift(withRate, withoutRate) {
  return withRate === null || withoutRate === null ? null : Number((withRate - withoutRate).toFixed(3));
}

export function outcomeView(o) {
  const retention = [safeRate(o.retained_with, o.early_with), safeRate(o.retained_without, o.early_without)];
  const upgrade = [safeRate(o.upgraded_with, o.users_with), safeRate(o.upgraded_without, o.users_without)];
  return {
    retentionWith: retention[0],
    retentionWithout: retention[1],
    retentionLift: lift(...retention),
    upgradeWith: upgrade[0],
    upgradeWithout: upgrade[1],
    upgradeLift: lift(...upgrade),
  };
}

function trend(wau, prevWau) {
  if (wau < K_ANONYMITY || prevWau < K_ANONYMITY) return null;
  return Number(((wau - prevWau) / prevWau).toFixed(3));
}

/** Assembles the Usage page from raw counts, masking every people count below k. */
export function usageView({ counts, active, byPlan, outcomes, daily }) {
  const countOf = new Map(counts.map((c) => [c.feature, c]));
  const outcomeOf = new Map(outcomes.map((o) => [o.feature, o]));
  const features = FEATURES.items.map((feature) => {
    const c = countOf.get(feature) ?? { uses: 0, users: 0, dau: 0, wau: 0, prev_wau: 0 };
    const o = outcomeOf.get(feature);
    return {
      feature,
      uses: c.uses,
      users: mask(c.users),
      dau: mask(c.dau),
      wau: mask(c.wau),
      trend: trend(c.wau, c.prev_wau),
      shareOfActive: safeRate(c.users, active),
      byPlan: byPlan
        .filter((p) => p.feature === feature)
        .map((p) => ({ plan: p.plan, users: mask(p.users) })),
      outcomes: o ? outcomeView(o) : null,
      series: daily
        .filter((d) => d.feature === feature)
        .map((d) => ({ day: d.day, users: mask(d.users).value })),
    };
  });
  const rare = (f) => f.users.masked || (f.shareOfActive !== null && f.shareOfActive < RARE_SHARE);
  return {
    activeUsers: mask(active),
    features,
    neverUsed: features.filter((f) => f.uses === 0).map((f) => f.feature),
    rarelyUsed: features.filter((f) => f.uses > 0 && rare(f)).map((f) => f.feature),
  };
}

export function dayString(date) {
  return date.toISOString().slice(0, 10);
}

export function daysBefore(date, days) {
  return new Date(date.getTime() - days * DAY_MS);
}
