/**
 * Pattern checks that keep identifiers, secrets and free text out of Vigie.
 * They are deliberately conservative: a false positive rejects one event, a false negative
 * would store personal data.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PARAM = /^:[a-zA-Z][a-zA-Z0-9_]{0,39}$/;
const LITERAL = /^[a-z][a-z0-9_.-]{0,39}$/;
const HEX_ID = /^[0-9a-f]{12,}$/;

/** True when one path segment looks like an identifier rather than a route word. */
function looksLikeId(segment) {
  if (/^\d+$/.test(segment) || HEX_ID.test(segment)) return true;
  const digits = segment.replace(/\D/g, '').length;
  return digits >= 4 || (segment.length > 24 && digits > 0);
}

/**
 * A template is `/`-separated lowercase words or `:params`, e.g. `/api/boards/:boardId`.
 * Returns false for raw URLs, ids, emails, tokens and query strings.
 */
export function isTemplate(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 200) return false;
  if (value === '/') return true;
  if (!value.startsWith('/') || value.endsWith('/')) return false;
  return value
    .slice(1)
    .split('/')
    .every((segment) => PARAM.test(segment) || (LITERAL.test(segment) && !looksLikeId(segment)));
}

export function isUuid(value) {
  return typeof value === 'string' && UUID.test(value);
}

const SENSITIVE = [
  /[^\s@]+@[^\s@]+\.[^\s@]+/, // email
  /\b\d{1,3}(\.\d{1,3}){3}\b/, // IPv4
  /\b[0-9a-f]{0,4}(:[0-9a-f]{0,4}){4,7}\b/i, // IPv6
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, // uuid
  /\d{6,}/, // long numbers: ids, phone numbers, card numbers
  /\beyJ[a-zA-Z0-9_-]+/, // JWT
  /\b(bearer|token|password|passwd|secret|api[_-]?key|authorization)\b/i,
  /https?:\/\/\S*[?#]/i, // URL with query string or fragment
  /[a-zA-Z0-9_-]{32,}/, // long opaque strings (keys, hashes)
];

/** True when a sanitised error message still contains something that must not be stored. */
export function looksSensitive(text) {
  return SENSITIVE.some((re) => re.test(text));
}

/** Opaque pseudonymous ids (visitor, session, user): HMACs or random ids, never raw values. */
export function isOpaqueId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value);
}

/** `data-vigie` element ids: stable developer-given keys, not labels. */
export function isElementId(value) {
  return typeof value === 'string' && /^[a-z][a-z0-9_.-]{0,63}$/.test(value);
}
