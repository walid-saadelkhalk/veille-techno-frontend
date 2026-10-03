// Carries one single fact from the HTTP client to React: the server refused
// the session.
//
// WHY THIS EXISTS AT ALL. The criterion is absolute, ANY 401 must purge and
// send the user back to the login screen. A 401 mostly arrives on a board
// request, so inside use-board, not inside use-auth. Asking every caller to
// handle it would make a forgotten call a silent security hole, and with five
// operations plus the loads, forgetting is a matter of time.
//
// So the client reports, once, and this object carries the news. It knows
// nothing about tokens, storage or React: deciding what a dead session means
// is use-auth's business.

export interface AuthEvents {
  /** Reports that the server refused the session. */
  emitUnauthorized(): void;

  /**
   * Starts listening, and returns the function that stops.
   *
   * Returning the unsubscriber is what lets useEffect hand it back as its
   * cleanup. Without it, a remounted hook would stack listeners for ever and
   * a surviving listener would set state on something no longer displayed.
   */
  subscribe(listener: () => void): () => void;
}

export function createAuthEvents(): AuthEvents {
  // A Set and not an array: subscribing twice with the same function is a
  // mistake, not an intent, and delete() by value needs no index lookup.
  const listeners = new Set<() => void>();

  return {
    emitUnauthorized: (): void => {
      // Copied before iterating: a listener that unsubscribes itself while
      // being notified would otherwise mutate the set being walked.
      for (const listener of [...listeners]) {
        listener();
      }
    },

    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}
