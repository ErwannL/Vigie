import { AppError } from '../errors.js';

/**
 * The only way adapters may call out: JSON over HTTP with a mandatory timeout.
 * Real adapter implementations (loki.js, prometheus.js, …) must use this helper.
 * An empty response body (e.g. 200/204 without content) returns null; a body that is not
 * JSON fails with `upstream_bad_response`.
 */
export async function fetchJson(url, { method = 'GET', headers = {}, body, timeoutMs, fetchImpl }) {
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const code = err.name === 'TimeoutError' ? 'upstream_timeout' : 'upstream_unreachable';
    throw new AppError(code, 502);
  }
  if (!response.ok) throw new AppError('upstream_error', 502, { status: response.status });
  const text = await response.text();
  if (text === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError('upstream_bad_response', 502);
  }
}

/** `Authorization: Bearer <token>` when a token is set, nothing otherwise. */
export function bearer(token) {
  return token ? { authorization: `Bearer ${token}` } : {};
}

/** Throws `upstream_bad_response` unless `ok`; adapters validate what they read. */
export function expectShape(ok, what) {
  if (!ok) throw new AppError('upstream_bad_response', 502, { what });
}

/** Joins a base URL (with or without trailing slash) and an absolute path. */
export function joinUrl(base, path) {
  return `${base.replace(/\/+$/, '')}${path}`;
}

/** A LogQL / PromQL double-quoted string literal: backslashes and quotes escaped. */
export function quoteString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
