/** An API failure carrying the server's error code; the UI maps it to a translation key. */
export class ApiError extends Error {
  constructor(code, status) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

const q = (params) => new URLSearchParams(params).toString();

/**
 * Client for Vigie's API. The session is a bearer token kept in memory (and in
 * sessionStorage by the caller), never a cookie: it works inside a cross-site iframe.
 * Every call has a timeout. A 401 on an operator call reports an expired session.
 */
export function createApi({ base, fetchImpl, timeoutMs = 15000 }) {
  let token = null;
  let unauthorized = () => {};

  async function request(path, { method = 'GET', body } = {}) {
    const headers = {};
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    let res;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new ApiError('network_error', 0);
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && token) unauthorized();
      throw new ApiError(data.error ?? 'unknown', res.status);
    }
    return data;
  }

  return {
    onUnauthorized(handler) {
      unauthorized = handler;
    },
    setToken(value) {
      token = value;
    },
    login: (ssoToken) => request('/auth/sso', { method: 'POST', body: { token: ssoToken } }),
    settings: () => request('/v1/settings'),
    incidents: (env, status) => request(`/v1/incidents?${q(status ? { env, status } : { env })}`),
    incident: (env, id) => request(`/v1/incidents/${id}?${q({ env })}`),
    replay: (env, id, targetEnv) =>
      request(`/v1/incidents/${id}/replay?${q({ env })}`, { method: 'POST', body: { targetEnv } }),
    resolve: (env, id) => request(`/v1/incidents/${id}/resolve?${q({ env })}`, { method: 'POST' }),
    detect: (env) => request(`/v1/detect?${q({ env })}`, { method: 'POST' }),
    routes: (env) => request(`/v1/routes?${q({ env })}`),
    compare: (envs, route, days) =>
      request(`/v1/compare/latency?${q({ envs: envs.join(','), route, days })}`),
    insight: (name, env, params = {}) => request(`/v1/insights/${name}?${q({ env, ...params })}`),
    previewPersonas: (body) => request('/v1/personas/preview', { method: 'POST', body }),
    pushPersonas: (body) => request('/v1/personas/push', { method: 'POST', body }),
    personaSets: (env) => request(`/v1/personas?${q({ env })}`),
  };
}
