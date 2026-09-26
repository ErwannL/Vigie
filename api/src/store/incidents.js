import { assertEnv } from '../env.js';

const FIELDS = {
  key: 'key',
  status: 'status',
  severity: 'severity',
  title: 'title',
  kinds: 'kinds',
  routes: 'routes',
  pages: 'pages',
  features: 'features',
  fingerprints: 'fingerprints',
  segments: 'segments',
  triggers: 'triggers',
  appVersion: 'app_version',
  sinceVersion: 'since_version',
  resolvedVersion: 'resolved_version',
  firstSeen: 'first_seen',
  lastSeen: 'last_seen',
  replay: 'replay',
  issueRef: 'issue_ref',
  history: 'history',
};
const JSON_FIELDS = new Set(['segments', 'triggers', 'replay', 'history']);

function toIncident(row) {
  const incident = { id: row.id, env: row.env };
  for (const [prop, column] of Object.entries(FIELDS)) incident[prop] = row[column];
  incident.updatedAt = row.updated_at;
  return incident;
}

function encode(prop, value) {
  return JSON_FIELDS.has(prop) && value !== null ? JSON.stringify(value) : value;
}

/** Incident storage; the environment is part of every lookup. */
export function createIncidentsRepo(db) {
  return {
    async create(env, incident) {
      assertEnv(env);
      const props = Object.keys(FIELDS);
      const values = props.map((p) => encode(p, incident[p] ?? null));
      const holders = props.map((_, i) => `$${i + 2}`).join(', ');
      const { rows } = await db.query(
        `INSERT INTO incidents (env, ${props.map((p) => FIELDS[p]).join(', ')})
         VALUES ($1, ${holders}) RETURNING *`,
        [env, ...values],
      );
      return toIncident(rows[0]);
    },

    async update(env, id, patch) {
      assertEnv(env);
      const props = Object.keys(patch);
      const sets = props.map((p, i) => `${FIELDS[p]} = $${i + 3}`);
      const { rows } = await db.query(
        `UPDATE incidents SET ${sets.join(', ')}, updated_at = now()
         WHERE env = $1 AND id = $2 RETURNING *`,
        [env, id, ...props.map((p) => encode(p, patch[p]))],
      );
      return toIncident(rows[0]);
    },

    async get(env, id) {
      assertEnv(env);
      const { rows } = await db.query('SELECT * FROM incidents WHERE env = $1 AND id = $2', [
        env,
        id,
      ]);
      return rows.length === 0 ? null : toIncident(rows[0]);
    },

    async latestByKey(env, key) {
      assertEnv(env);
      const { rows } = await db.query(
        'SELECT * FROM incidents WHERE env = $1 AND key = $2 ORDER BY last_seen DESC, id DESC LIMIT 1',
        [env, key],
      );
      return rows.length === 0 ? null : toIncident(rows[0]);
    },

    async list(env, { status = null, limit = 100 } = {}) {
      assertEnv(env);
      const { rows } = await db.query(
        `SELECT * FROM incidents WHERE env = $1 AND ($2::text IS NULL OR status = $2)
         ORDER BY last_seen DESC, id DESC LIMIT $3`,
        [env, status, limit],
      );
      return rows.map(toIncident);
    },
  };
}
