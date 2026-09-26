/**
 * Reads the admin console's handoff token from `#sso=<jwt>` and removes the fragment from the
 * URL immediately (before any network call), so the token never stays in history.
 */
export function takeHandoff(location, history) {
  const match = /(?:^#|&)sso=([^&]+)/.exec(location.hash);
  if (!match) return null;
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  return decodeURIComponent(match[1]);
}
