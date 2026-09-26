/**
 * The only outside input of the test suite: where the throwaway test database lives.
 * docker compose sets it; the default matches a local PostgreSQL.
 */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://vigie:vigie@127.0.0.1:5432/vigie_test';
