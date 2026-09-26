import { assertEnv } from '../env.js';

/** Single-use SSO token ids. */
export function createJtiRepo(db) {
  return {
    /** Returns true the first time a jti is seen, false on replay. */
    async consume(jti, expiresAt) {
      const { rowCount } = await db.query(
        'INSERT INTO sso_jti (jti, expires_at) VALUES ($1, $2) ON CONFLICT (jti) DO NOTHING',
        [jti, expiresAt],
      );
      return rowCount === 1;
    },
    async purge(now) {
      return (await db.query('DELETE FROM sso_jti WHERE expires_at < $1', [now])).rowCount;
    },
  };
}

/** Operator actions. The operator name from the SSO token is only ever stored here. */
export function createAuditRepo(db) {
  return {
    async record({ operator, operatorName = null, action, env = null, details = {} }) {
      if (env !== null) assertEnv(env);
      await db.query(
        'INSERT INTO audit_log (operator, operator_name, action, env, details) VALUES ($1, $2, $3, $4, $5)',
        [operator, operatorName, action, env, details],
      );
    },
  };
}

/** Persona sets sent to Figura, stored under their source environment. */
export function createPersonaSetsRepo(db) {
  return {
    async save(env, { targetEnv, payload, accepted, pushedBy }) {
      assertEnv(env);
      const { rows } = await db.query(
        `INSERT INTO persona_sets (env, target_env, payload, accepted, pushed_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, pushed_at`,
        [env, targetEnv, payload, accepted, pushedBy],
      );
      return rows[0];
    },
    async list(env, limit = 20) {
      assertEnv(env);
      const { rows } = await db.query(
        `SELECT id, env, target_env, payload, accepted, pushed_at FROM persona_sets
         WHERE env = $1 ORDER BY pushed_at DESC, id DESC LIMIT $2`,
        [env, limit],
      );
      return rows;
    },
  };
}
