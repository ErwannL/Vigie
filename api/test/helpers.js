import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { createContainer } from '../src/container.js';
import { createDb } from '../src/store/db.js';
import { migrate } from '../src/store/migrate.js';
import { TEST_DATABASE_URL } from './db-url.js';

export const SECRETS = {
  dev: 'd'.repeat(40),
  recette: 'r'.repeat(40),
  prod: 'p'.repeat(40),
  sso: 's'.repeat(40),
  session: 'x'.repeat(40),
};

/** Environment variables for a fully configured development instance. */
export function testVars(overrides = {}) {
  return {
    VIGIE_MODE: 'development',
    DATABASE_URL: TEST_DATABASE_URL,
    VIGIE_LOG_LEVEL: 'silent',
    VIGIE_INGEST_SECRET_DEV: SECRETS.dev,
    VIGIE_INGEST_SECRET_RECETTE: SECRETS.recette,
    VIGIE_INGEST_SECRET_PROD: SECRETS.prod,
    VIGIE_SSO_SECRET: SECRETS.sso,
    VIGIE_SESSION_SECRET: SECRETS.session,
    VIGIE_ALLOWED_FRAME_ANCESTORS: 'https://admin.orqea.test',
    VIGIE_PUBLIC_URL: 'https://vigie.test',
    ...overrides,
  };
}

let shared = null;

/** One migrated pool for the whole run; tables are truncated between tests. */
export async function testDb() {
  if (shared === null) {
    shared = createDb({ connectionString: TEST_DATABASE_URL, max: 4 });
    await migrate(shared);
  }
  return shared;
}

export async function resetDb(db) {
  await db.query(
    'TRUNCATE events, daily_route_stats, daily_feature_usage, incidents, persona_sets, sso_jti, audit_log RESTART IDENTITY',
  );
}

export function fixedClock(iso = '2026-09-01T12:00:00.000Z') {
  const clock = {
    current: new Date(iso),
    now: () => new Date(clock.current),
    advance(ms) {
      clock.current = new Date(clock.current.getTime() + ms);
    },
  };
  return clock;
}

/** Captures log lines written by pino. */
export function logSink() {
  const lines = [];
  const stream = new Writable({
    write(chunk, _enc, done) {
      lines.push(chunk.toString());
      done();
    },
  });
  return { lines, stream, text: () => lines.join('') };
}

export async function testContainer({ vars = {}, clock = fixedClock(), logStream } = {}) {
  const db = await testDb();
  await resetDb(db);
  return createContainer(testVars(vars), { clock, db, logStream });
}

/** A valid analytics event; override any field. */
export function makeEvent(overrides = {}) {
  return {
    schema: 1,
    env: 'prod',
    eventId: randomUUID(),
    occurredAt: '2026-09-01T11:00:00.000Z',
    source: 'app',
    type: 'feature_use',
    visitor: 'visitor_0001',
    session: 'session_0001',
    user: 'user_000001',
    account: { plan: 'pro', seats: 3, ageDays: 40, segment: 'smb' },
    context: { country: 'FR', locale: 'fr', device: 'desktop', theme: 'dark', appVersion: '2.3.1' },
    target: { page: '/board/:boardId', element: 'card.save', feature: 'card.create' },
    perf: { durationMs: 120, status: 200, route: '/api/cards' },
    consent: 'analytics',
    ...overrides,
  };
}

export const silentLog = { info() {}, warn() {}, error() {}, debug() {} };
