import pg from 'pg';

// Return bigint counts and ids as JS numbers; values stay far below 2^53.
pg.types.setTypeParser(20, (v) => Number.parseInt(v, 10));
// Keep `date` columns as 'YYYY-MM-DD' strings instead of local-midnight Date objects.
pg.types.setTypeParser(1082, (v) => v);

/** Creates the connection pool. Every query carries a statement timeout. */
export function createDb({ connectionString, max = 10, statementTimeoutMs = 15000 }) {
  const pool = new pg.Pool({
    connectionString,
    max,
    statement_timeout: statementTimeoutMs,
    connectionTimeoutMillis: 5000,
  });
  return {
    pool,
    query: (text, params) => pool.query(text, params),
    async ping() {
      await pool.query('SELECT 1');
    },
    close: () => pool.end(),
  };
}
