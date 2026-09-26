import { AppError } from '../errors.js';

/**
 * The only way adapters may call out: JSON over HTTP with a mandatory timeout.
 * Real adapter implementations (loki.js, prometheus.js, …) must use this helper.
 */
export async function fetchJson(url, { method = 'GET', headers = {}, body, timeoutMs, fetchImpl }) {
  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers: { accept: 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const code = err.name === 'TimeoutError' ? 'upstream_timeout' : 'upstream_unreachable';
    throw new AppError(code, 502);
  }
  if (!response.ok) throw new AppError('upstream_error', 502, { status: response.status });
  return response.json();
}
