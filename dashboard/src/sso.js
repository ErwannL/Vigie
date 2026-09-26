const ENVS = new Set(['dev', 'recette', 'prod']);

function param(hash, name) {
  const match = new RegExp(`(?:^#|&)${name}=([^&]*)`).exec(hash);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Reads the admin console's handoff from `#sso=<jwt>&env=<dev|recette|prod>` and removes the
 * fragment from the URL immediately (before any network call), so the token never stays in
 * history. `env` is kept only when it is one of the three known environments.
 * Returns `null` when there is no token, else `{ token, env }` (`env` may be `null`).
 */
export function takeHandoff(location, history) {
  const token = param(location.hash, 'sso');
  if (!token) return null;
  const env = param(location.hash, 'env');
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  return { token, env: ENVS.has(env) ? env : null };
}
