import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, expect, test } from 'vitest';
import { validateEvent } from '../src/collector/validate.js';
import { createEventsRepo } from '../src/store/events.js';
import { createIncidentsRepo } from '../src/store/incidents.js';
import { migrate } from '../src/store/migrate.js';
import { createAuditRepo, createJtiRepo, createPersonaSetsRepo } from '../src/store/misc.js';
import { createDb } from '../src/store/db.js';
import { TEST_DATABASE_URL } from './db-url.js';
import { makeEvent, resetDb, testDb } from './helpers.js';

let db;
beforeEach(async () => {
  db = await testDb();
  await resetDb(db);
});
afterAll(async () => {
  await db.close();
});

const row = (over = {}) =>
  validateEvent(makeEvent(over), {
    env: over.env ?? 'prod',
    now: new Date('2026-09-01T12:00:00Z'),
    retentionDays: 60,
  }).row;

test('insert is idempotent on (env, eventId) and environments never mix', async () => {
  const events = createEventsRepo(db);
  const a = row();
  expect(await events.insert('prod', [a, a])).toBe(1);
  expect(await events.insert('prod', [a])).toBe(0);
  expect(await events.insert('recette', [row({ env: 'recette', eventId: a.eventId })])).toBe(1);
  expect(await events.insert('prod', [])).toBe(0);
  const { rows } = await db.query(
    'SELECT env, count(*) AS n FROM events GROUP BY env ORDER BY env',
  );
  expect(rows).toEqual([
    { env: 'prod', n: 1 },
    { env: 'recette', n: 1 },
  ]);
  const parts = await db.query('SELECT count(*) AS n FROM events_prod');
  expect(parts.rows[0].n).toBe(1);
});

test('every repository function requires a valid environment', async () => {
  const events = createEventsRepo(db);
  await expect(events.insert(undefined, [])).rejects.toThrow('invalid_env');
  await expect(events.forSubject('all', 'u')).rejects.toThrow('invalid_env');
  await expect(events.deleteSubject(null, 'u')).rejects.toThrow('invalid_env');
  await expect(events.deleteOlderThan('x', new Date())).rejects.toThrow('invalid_env');
  await expect(events.countAnalytics('x', new Date(), new Date())).rejects.toThrow('invalid_env');
  const incidents = createIncidentsRepo(db);
  await expect(incidents.get('x', 1)).rejects.toThrow('invalid_env');
  await expect(incidents.list('x')).rejects.toThrow('invalid_env');
  await expect(incidents.create('x', {})).rejects.toThrow('invalid_env');
  await expect(incidents.update('x', 1, {})).rejects.toThrow('invalid_env');
  await expect(incidents.latestByKey('x', 'k')).rejects.toThrow('invalid_env');
  const sets = createPersonaSetsRepo(db);
  await expect(sets.save('x', {})).rejects.toThrow('invalid_env');
  await expect(sets.list('x')).rejects.toThrow('invalid_env');
  await expect(
    createAuditRepo(db).record({ operator: 'o', action: 'a', env: 'x' }),
  ).rejects.toThrow('invalid_env');
});

test('subject export and erasure are scoped to one environment and idempotent', async () => {
  const events = createEventsRepo(db);
  await events.insert('prod', [row(), row(), row({ user: 'someone_else' })]);
  await events.insert('recette', [row({ env: 'recette' })]);
  const exported = await events.forSubject('prod', 'user_000001');
  expect(exported).toHaveLength(2);
  expect(exported[0]).toMatchObject({ user_id: 'user_000001', feature: 'card.create' });
  expect(await events.deleteSubject('prod', 'user_000001')).toBe(2);
  expect(await events.deleteSubject('prod', 'user_000001')).toBe(0);
  expect(await events.forSubject('prod', 'user_000001')).toEqual([]);
  expect(await events.forSubject('recette', 'user_000001')).toHaveLength(1);
});

test('retention deletion and analytics counts', async () => {
  const events = createEventsRepo(db);
  await events.insert('prod', [
    row({ occurredAt: '2026-08-01T00:00:00Z' }),
    row({ occurredAt: '2026-09-01T00:00:00Z' }),
    row({ occurredAt: '2026-09-01T01:00:00Z', consent: 'essential' }),
  ]);
  const from = new Date('2026-08-20T00:00:00Z');
  const to = new Date('2026-09-02T00:00:00Z');
  expect(await events.countAnalytics('prod', from, to)).toBe(1);
  expect(await events.deleteOlderThan('prod', new Date('2026-08-15T00:00:00Z'))).toBe(1);
  expect(await events.deleteOlderThan('prod', new Date('2026-08-15T00:00:00Z'))).toBe(0);
});

const incident = (over = {}) => ({
  key: 'route:/api/x',
  status: 'open',
  severity: 'high',
  title: 'Slow /api/x',
  kinds: ['latency'],
  routes: ['/api/x'],
  pages: [],
  features: [],
  fingerprints: [],
  segments: { device: [], plan: [] },
  triggers: [{ kind: 'latency' }],
  appVersion: '1.0.0',
  firstSeen: new Date('2026-09-01T10:00:00Z'),
  lastSeen: new Date('2026-09-01T11:00:00Z'),
  history: [],
  ...over,
});

test('incident storage round-trip, filters and env isolation', async () => {
  const repo = createIncidentsRepo(db);
  const a = await repo.create('prod', incident());
  expect(a).toMatchObject({ id: 1, env: 'prod', kinds: ['latency'], replay: null, issueRef: null });
  await repo.create('recette', incident());
  const updated = await repo.update('prod', a.id, { status: 'resolved', replay: { runId: 'r' } });
  expect(updated).toMatchObject({ status: 'resolved', replay: { runId: 'r' } });
  expect(await repo.get('prod', 99)).toBeNull();
  expect(await repo.get('recette', a.id)).toBeNull();
  expect((await repo.latestByKey('prod', 'route:/api/x')).id).toBe(1);
  expect(await repo.latestByKey('prod', 'route:/nope')).toBeNull();
  expect(await repo.list('prod', { status: 'open' })).toEqual([]);
  expect(await repo.list('prod')).toHaveLength(1);
  const cleared = await repo.update('prod', a.id, { replay: null });
  expect(cleared.replay).toBeNull();
});

test('sso jti is single use and purgeable', async () => {
  const jti = createJtiRepo(db);
  const exp = new Date('2026-09-01T12:01:00Z');
  expect(await jti.consume('j1', exp)).toBe(true);
  expect(await jti.consume('j1', exp)).toBe(false);
  expect(await jti.purge(new Date('2026-09-01T12:00:00Z'))).toBe(0);
  expect(await jti.purge(new Date('2026-09-01T13:00:00Z'))).toBe(1);
});

test('audit log and persona sets', async () => {
  const audit = createAuditRepo(db);
  await audit.record({ operator: 'op', action: 'sso.login' });
  await audit.record({
    operator: 'op',
    operatorName: 'Ada',
    action: 'x',
    env: 'prod',
    details: { a: 1 },
  });
  const { rows } = await db.query('SELECT operator_name, env, details FROM audit_log ORDER BY id');
  expect(rows).toEqual([
    { operator_name: null, env: null, details: {} },
    { operator_name: 'Ada', env: 'prod', details: { a: 1 } },
  ]);
  const sets = createPersonaSetsRepo(db);
  const saved = await sets.save('prod', {
    targetEnv: 'recette',
    payload: { p: 1 },
    accepted: 2,
    pushedBy: 'op',
  });
  expect(saved.id).toBe(1);
  expect(await sets.list('prod')).toMatchObject([
    { env: 'prod', target_env: 'recette', accepted: 2 },
  ]);
  expect(await sets.list('recette')).toEqual([]);
  await expect(
    sets.save('prod', { targetEnv: 'prod', payload: {}, accepted: 0, pushedBy: 'op' }),
  ).rejects.toThrow(/check constraint/);
});

test('migrations are idempotent and a failing migration is rolled back', async () => {
  expect(await migrate(db)).toEqual([]);
  const dir = await mkdtemp(join(tmpdir(), 'vigie-mig-'));
  await writeFile(join(dir, '001_ok.sql'), 'CREATE TABLE mig_probe (x int);');
  await writeFile(join(dir, '002_bad.sql'), 'CREATE TABLE mig_probe2 (x int); SELECT nope();');
  await writeFile(join(dir, 'README.md'), 'ignored');
  const other = createDb({ connectionString: TEST_DATABASE_URL });
  await other.query('DROP TABLE IF EXISTS mig_probe, mig_probe2');
  await other.query("DELETE FROM schema_migrations WHERE name IN ('001_ok.sql', '002_bad.sql')");
  await expect(migrate(other, dir)).rejects.toThrow();
  const probe2 = await other.query("SELECT to_regclass('mig_probe2') AS t");
  expect(probe2.rows[0].t).toBeNull();
  const probe = await other.query("SELECT to_regclass('mig_probe') AS t");
  expect(probe.rows[0].t).toBe('mig_probe');
  await other.query('DROP TABLE mig_probe');
  await other.query("DELETE FROM schema_migrations WHERE name = '001_ok.sql'");
  await other.ping();
  await other.close();
});
