import { readFileSync } from 'node:fs';
import pino from 'pino';
import { createAdapters } from './adapters/registry.js';
import { createCollector } from './collector/ingest.js';
import { loadConfig } from './config.js';
import { createIncidentQueries } from './modules/incidents/queries.js';
import { createIncidentService } from './modules/incidents/service.js';
import { createInsightsService } from './modules/insights/service.js';
import { createDb } from './store/db.js';
import { createEventsRepo } from './store/events.js';
import { createIncidentsRepo } from './store/incidents.js';
import { createAuditRepo, createJtiRepo, createPersonaSetsRepo } from './store/misc.js';

export const systemClock = Object.freeze({ now: () => new Date() });

export const FIXTURES_PATH = new URL('../fixtures/sources.json', import.meta.url);

/** Fixture data for the fake pull sources, used only in development mode. */
export function loadFixtures(config, path = FIXTURES_PATH) {
  return config.mode === 'development' ? JSON.parse(readFileSync(path, 'utf8')) : {};
}

/**
 * Wires every component from environment variables. The API, the jobs process, the seed and
 * the tests all build their world through this one function.
 */
export function createContainer(vars, { clock = systemClock, logStream = undefined, db } = {}) {
  const config = loadConfig(vars);
  const log = pino({ level: config.logLevel }, logStream);
  const database = db ?? createDb({ connectionString: config.databaseUrl });
  const repos = {
    events: createEventsRepo(database),
    incidents: createIncidentsRepo(database),
    jti: createJtiRepo(database),
    audit: createAuditRepo(database),
    personaSets: createPersonaSetsRepo(database),
  };
  const adapters = createAdapters(config, { clock, fixtures: loadFixtures(config) });
  const incidents = createIncidentService({
    repo: repos.incidents,
    queries: createIncidentQueries(database),
    adapters,
    config,
    clock,
    audit: repos.audit,
    log,
    db: database,
  });
  const insights = createInsightsService({
    db: database,
    events: repos.events,
    clock,
    adapters,
    personaSets: repos.personaSets,
    audit: repos.audit,
  });
  return {
    config,
    clock,
    log,
    db: database,
    repos,
    adapters,
    collector: createCollector({ eventsRepo: repos.events, config, clock }),
    services: { incidents, insights },
  };
}
