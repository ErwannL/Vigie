import { createContext, useContext } from 'react';

/** What every page needs: the API client, the selected environment and translation. */
export const AppContext = createContext(null);

export function useApp() {
  return useContext(AppContext);
}
