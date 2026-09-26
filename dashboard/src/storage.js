/** Storage that never throws (private windows and sandboxed iframes may block it). */
export function safeStorage(getStore) {
  return {
    get(key) {
      try {
        return getStore().getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        getStore().setItem(key, value);
      } catch {
        // storage unavailable: the value simply is not remembered
      }
    },
    remove(key) {
      try {
        getStore().removeItem(key);
      } catch {
        // same as above
      }
    },
  };
}

const SESSION_KEY = 'vigie.session';

/** The operator session survives a reload of the iframe, not the browser tab. */
export function loadSession(store, now) {
  const raw = store.get(SESSION_KEY);
  if (raw === null) return null;
  try {
    const session = JSON.parse(raw);
    return Date.parse(session.expiresAt) > now.getTime() ? session : null;
  } catch {
    return null;
  }
}

export function saveSession(store, session) {
  store.set(SESSION_KEY, JSON.stringify({ token: session.token, expiresAt: session.expiresAt }));
}

export function clearSession(store) {
  store.remove(SESSION_KEY);
}
