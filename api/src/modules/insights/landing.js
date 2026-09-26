import { mask, safeRate } from './kanon.js';

export async function landingCounts(db, env, from, to) {
  const { rows } = await db.query(
    `SELECT count(*) AS views, count(DISTINCT visitor) AS visitors FROM events
     WHERE env = $1 AND consent = 'analytics' AND source = 'landing' AND type = 'page_view'
       AND occurred_at >= $2 AND occurred_at < $3`,
    [env, from, to],
  );
  return rows[0];
}

export async function landingClicks(db, env, from, to) {
  const { rows } = await db.query(
    `SELECT element, count(*) AS clicks, count(DISTINCT visitor) AS visitors FROM events
     WHERE env = $1 AND consent = 'analytics' AND source = 'landing' AND type = 'click'
       AND element IS NOT NULL AND occurred_at >= $2 AND occurred_at < $3
     GROUP BY element ORDER BY clicks DESC, element`,
    [env, from, to],
  );
  return rows;
}

/**
 * Visitors who landed, split into new visitors and returning accounts (a login and no signup
 * in the window), with how many then signed up or logged in.
 */
export async function landingConversions(db, env, from, to) {
  const { rows } = await db.query(
    `WITH v AS (
       SELECT visitor,
         min(occurred_at) FILTER (WHERE source = 'landing' AND type = 'page_view') AS landed,
         min(occurred_at) FILTER (WHERE type = 'signup') AS signed_up,
         min(occurred_at) FILTER (WHERE type = 'login') AS logged_in
       FROM events
       WHERE env = $1 AND consent = 'analytics' AND visitor IS NOT NULL
         AND occurred_at >= $2 AND occurred_at < $3
       GROUP BY visitor
     )
     SELECT CASE WHEN logged_in IS NOT NULL AND signed_up IS NULL THEN 'returning' ELSE 'new' END
              AS kind,
            count(*) AS visitors,
            count(*) FILTER (WHERE signed_up >= landed) AS signups,
            count(*) FILTER (WHERE logged_in >= landed) AS logins
     FROM v WHERE landed IS NOT NULL
     GROUP BY 1`,
    [env, from, to],
  );
  return rows;
}

export function landingView({ counts, clicks, conversions }) {
  const byKind = (kind) =>
    conversions.find((c) => c.kind === kind) ?? { visitors: 0, signups: 0, logins: 0 };
  const split = Object.fromEntries(
    ['new', 'returning'].map((kind) => {
      const c = byKind(kind);
      return [
        kind,
        {
          visitors: mask(c.visitors),
          signupRate: safeRate(c.signups, c.visitors),
          loginRate: safeRate(c.logins, c.visitors),
        },
      ];
    }),
  );
  return {
    views: counts.views,
    visitors: mask(counts.visitors),
    clicks: clicks.map((c) => ({
      element: c.element,
      clicks: c.clicks,
      visitors: mask(c.visitors),
      clickRate: safeRate(c.visitors, counts.visitors),
    })),
    conversion: split,
  };
}
