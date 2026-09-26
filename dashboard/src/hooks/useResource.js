import { useCallback, useEffect, useState } from 'react';

/**
 * Loads data with `load` (a memoised function) and reloads when it changes. Results that
 * arrive after the component moved on (unmount, env change) are ignored.
 */
export function useResource(load) {
  const [state, setState] = useState({ status: 'loading', data: null, error: null });
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let current = true;
    setState((s) => ({ ...s, status: 'loading' }));
    load().then(
      (data) => current && setState({ status: 'ready', data, error: null }),
      (error) => current && setState({ status: 'error', data: null, error }),
    );
    return () => {
      current = false;
    };
  }, [load, version]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { ...state, reload };
}
