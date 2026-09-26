import {
  CONSENTS,
  DEVICES,
  EVENT_SCHEMA_VERSION,
  EVENT_TYPES,
  FEATURES,
  PLANS,
  SOURCES,
  THEMES,
} from '../catalogues.js';
import { isElementId, isOpaqueId, isTemplate, isUuid, looksSensitive } from './sanitize.js';

const TOP_KEYS = [
  'schema',
  'env',
  'eventId',
  'occurredAt',
  'source',
  'type',
  'visitor',
  'session',
  'user',
  'account',
  'context',
  'target',
  'perf',
  'error',
  'consent',
];
const NESTED_KEYS = {
  account: ['plan', 'seats', 'ageDays', 'segment'],
  context: ['country', 'locale', 'device', 'theme', 'appVersion'],
  target: ['page', 'element', 'feature'],
  perf: ['durationMs', 'status', 'route'],
  error: ['kind', 'fingerprint', 'message'],
};
const ISO_UTC = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d{1,6})?Z$/;
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

class Reject extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function check(condition, code) {
  if (!condition) throw new Reject(code);
}

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const absent = (v) => v === undefined || v === null;
const optional = (v, test) => absent(v) || test(v);
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const matches = (re) => (v) => typeof v === 'string' && re.test(v);

function checkKeys(obj, allowed, code) {
  check(
    Object.keys(obj).every((k) => allowed.includes(k)),
    code,
  );
}

function section(event, name) {
  const value = event[name];
  if (absent(value)) return {};
  check(isObject(value), `invalid_${name}`);
  checkKeys(value, NESTED_KEYS[name], `unknown_field_${name}`);
  return value;
}

function checkEnvelope(event, env, now, retentionDays) {
  check(isObject(event), 'invalid_event');
  checkKeys(event, TOP_KEYS, 'unknown_field');
  check(event.schema === EVENT_SCHEMA_VERSION, 'unsupported_schema');
  check(event.env === env, 'env_mismatch');
  check(isUuid(event.eventId), 'invalid_event_id');
  check(matches(ISO_UTC)(event.occurredAt), 'invalid_occurred_at');
  const at = Date.parse(event.occurredAt);
  check(!Number.isNaN(at), 'invalid_occurred_at');
  check(at <= now.getTime() + FUTURE_TOLERANCE_MS, 'occurred_at_in_future');
  check(at >= now.getTime() - retentionDays * 86400000, 'occurred_at_too_old');
  check(SOURCES.includes(event.source), 'invalid_source');
  check(EVENT_TYPES.includes(event.type), 'unknown_type');
  check(CONSENTS.includes(event.consent), 'invalid_consent');
  check(optional(event.visitor, isOpaqueId), 'invalid_visitor');
  check(optional(event.session, isOpaqueId), 'invalid_session');
  check(optional(event.user, isOpaqueId), 'invalid_user');
}

function checkAccount(account) {
  check(
    optional(account.plan, (v) => PLANS.includes(v)),
    'invalid_plan',
  );
  check(
    optional(account.seats, (v) => isInt(v, 1, 1000000)),
    'invalid_seats',
  );
  check(
    optional(account.ageDays, (v) => isInt(v, 0, 100000)),
    'invalid_age_days',
  );
  check(optional(account.segment, matches(/^[a-z0-9_.-]{1,40}$/)), 'invalid_segment');
}

function checkContext(context) {
  check(optional(context.country, matches(/^[A-Z]{2}$/)), 'invalid_country');
  check(optional(context.locale, matches(/^[a-z]{2}(-[A-Z]{2})?$/)), 'invalid_locale');
  check(
    optional(context.device, (v) => DEVICES.includes(v)),
    'invalid_device',
  );
  check(
    optional(context.theme, (v) => THEMES.includes(v)),
    'invalid_theme',
  );
  check(
    optional(context.appVersion, matches(/^\d{1,4}\.\d{1,4}\.\d{1,6}(-[0-9A-Za-z.]{1,20})?$/)),
    'invalid_app_version',
  );
}

function checkTarget(target) {
  check(optional(target.page, isTemplate), 'page_not_template');
  check(optional(target.element, isElementId), 'invalid_element');
  check(
    optional(target.feature, (v) => FEATURES.items.includes(v)),
    'unknown_feature',
  );
}

function checkPerf(perf) {
  check(
    optional(perf.durationMs, (v) => isInt(v, 0, 3600000)),
    'invalid_duration',
  );
  check(
    optional(perf.status, (v) => isInt(v, 100, 599)),
    'invalid_status',
  );
  check(optional(perf.route, isTemplate), 'route_not_template');
}

function checkError(error) {
  check(optional(error.kind, matches(/^[A-Za-z0-9_.:-]{1,64}$/)), 'invalid_error_kind');
  check(
    optional(error.fingerprint, matches(/^[A-Za-z0-9_.:-]{1,128}$/)),
    'invalid_error_fingerprint',
  );
  const message = error.message;
  check(
    optional(message, (v) => typeof v === 'string' && v.length <= 300),
    'invalid_error_message',
  );
  check(absent(message) || !looksSensitive(message), 'unsanitised_error_message');
}

const nul = (v) => (absent(v) ? null : v);

/** Flattens a valid event into a storage row. Essential consent drops behavioural fields. */
function toRow(event, sections) {
  const { account, context, target, perf, error } = sections;
  const analytics = event.consent === 'analytics';
  const keep = (v) => (analytics ? nul(v) : null);
  return {
    eventId: event.eventId.toLowerCase(),
    occurredAt: event.occurredAt,
    source: event.source,
    type: event.type,
    consent: event.consent,
    visitor: keep(event.visitor),
    session: nul(event.session),
    user: keep(event.user),
    plan: nul(account.plan),
    seats: keep(account.seats),
    ageDays: keep(account.ageDays),
    segment: keep(account.segment),
    country: keep(context.country),
    locale: keep(context.locale),
    device: nul(context.device),
    theme: keep(context.theme),
    appVersion: nul(context.appVersion),
    page: nul(target.page),
    element: keep(target.element),
    feature: keep(target.feature),
    durationMs: nul(perf.durationMs),
    status: nul(perf.status),
    route: nul(perf.route),
    errorKind: nul(error.kind),
    errorFingerprint: nul(error.fingerprint),
    errorMessage: nul(error.message),
  };
}

/**
 * Validates one event sent with the credential of `env`.
 * Returns `{ ok: true, row }` or `{ ok: false, code }`; never throws.
 */
export function validateEvent(event, { env, now, retentionDays }) {
  try {
    checkEnvelope(event, env, now, retentionDays);
    const sections = Object.fromEntries(
      Object.keys(NESTED_KEYS).map((name) => [name, section(event, name)]),
    );
    checkAccount(sections.account);
    checkContext(sections.context);
    checkTarget(sections.target);
    checkPerf(sections.perf);
    checkError(sections.error);
    return { ok: true, row: toRow(event, sections) };
  } catch (err) {
    return { ok: false, code: err.code };
  }
}
