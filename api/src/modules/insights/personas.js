import { FUNNELS, K_ANONYMITY } from '../../catalogues.js';
import { assertEnv, assertFiguraTarget } from '../../env.js';
import { funnelView, groupSubjects } from './funnels.js';

export const PERSONA_SET_SCHEMA = 1;

/** Per (plan, device): sessions, people, median session length, dominant locale. */
export async function personaGroups(db, env, from, to) {
  const { rows } = await db.query(
    `WITH s AS (
       SELECT session, max(user_id) AS user_id, max(plan) AS plan,
              mode() WITHIN GROUP (ORDER BY device) AS device,
              mode() WITHIN GROUP (ORDER BY locale) AS locale,
              count(*) AS events,
              extract(epoch FROM max(occurred_at) - min(occurred_at)) / 60 AS minutes
       FROM events
       WHERE env = $1 AND consent = 'analytics' AND session IS NOT NULL AND user_id IS NOT NULL
         AND occurred_at >= $2 AND occurred_at < $3
       GROUP BY session
     )
     SELECT plan, device, mode() WITHIN GROUP (ORDER BY locale) AS locale,
            count(*) AS sessions, count(DISTINCT user_id) AS users,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY events) AS median_events,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY minutes) AS median_minutes
     FROM s WHERE plan IS NOT NULL AND device IS NOT NULL
     GROUP BY plan, device`,
    [env, from, to],
  );
  return rows;
}

/** Per (plan, device, feature): number of sessions that used the feature. */
export async function personaFeatures(db, env, from, to) {
  const { rows } = await db.query(
    `WITH s AS (
       SELECT session, max(plan) AS plan, mode() WITHIN GROUP (ORDER BY device) AS device,
              array_agg(DISTINCT feature) FILTER (WHERE type = 'feature_use' AND feature IS NOT NULL)
                AS features
       FROM events
       WHERE env = $1 AND consent = 'analytics' AND session IS NOT NULL AND user_id IS NOT NULL
         AND occurred_at >= $2 AND occurred_at < $3
       GROUP BY session
     )
     SELECT plan, device, f.feature, count(*) AS sessions
     FROM s CROSS JOIN LATERAL unnest(s.features) AS f(feature)
     WHERE plan IS NOT NULL AND device IS NOT NULL
     GROUP BY plan, device, f.feature`,
    [env, from, to],
  );
  return rows;
}

const round3 = (n) => Number(n.toFixed(3));

function dropOffs(subjects) {
  return Object.fromEntries(
    FUNNELS.items.map((funnel) => [
      funnel.key,
      Object.fromEntries(
        funnelView(funnel, subjects)
          .slice(1)
          .map((step) => [step.key, step.dropOff]),
      ),
    ]),
  );
}

/**
 * Derives a PersonaSet: one persona per (plan, device) group with at least k people, with
 * behaviour weights taken from real usage and the sample it was derived from.
 */
export function derivePersonaSet({ sourceEnv, targetEnv, window, groups, features, subjects }) {
  assertEnv(sourceEnv);
  assertFiguraTarget(targetEnv);
  const byPersona = groupSubjects(
    subjects.map((events) =>
      events.map((e) => ({ ...e, persona: e.plan && e.device ? `${e.plan}|${e.device}` : null })),
    ),
    'persona',
  );
  const personas = groups
    .filter((g) => g.users >= K_ANONYMITY)
    .map((g) => {
      const key = `${g.plan}|${g.device}`;
      const weights = features
        .filter((f) => f.plan === g.plan && f.device === g.device)
        .map((f) => [f.feature, round3(f.sessions / g.sessions)])
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
      return {
        name: `${g.plan}-${g.device}`,
        traits: { plan: g.plan, device: g.device, locale: g.locale ?? 'en' },
        weights: {
          features: Object.fromEntries(weights),
          sessionLength: {
            medianEvents: round3(g.median_events),
            medianMinutes: round3(g.median_minutes),
          },
          dropOff: dropOffs(byPersona.get(key) ?? []),
        },
        sample: { people: g.users, sessions: g.sessions, window },
      };
    })
    .sort((a, b) => b.sample.people - a.sample.people || a.name.localeCompare(b.name));
  return {
    schema: PERSONA_SET_SCHEMA,
    kind: 'vigie.persona_set',
    sourceEnv,
    targetEnv,
    window,
    personas,
  };
}
