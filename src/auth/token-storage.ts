// The only file in the project that knows where the token lives. Everything
// else asks this module, so changing the storage location is one edit here
// and nothing else.
//
// WHY THE ISOLATION IS A SECURITY MEASURE AND NOT TIDINESS: if the location
// changed and a direct read were left behind in a component, that read would
// keep aiming at the old place. A token forgotten in a storage we believe
// purged is a leak, not an untidy file.
//
// The location itself is decided by ADR-016: localStorage, so that a reload
// keeps the session. Its limit is named rather than hidden: any XSS in our
// own code would hand over the token. sessionStorage would NOT be safer, the
// exposure is identical and only the lifetime differs; React memory alone
// would be safer and was ruled out knowingly, since it breaks the reload
// scenario. An httpOnly cookie is out of reach, the API does not emit one.
//
// This module never logs the token, not even inside an error path, because
// the most natural message to write there is the one carrying the value.

/**
 * The storage key, prefixed with the project.
 *
 * A bare "token" would be shared with every other Vite project served on
 * localhost:5173, since localStorage is scoped to the origin, port included.
 */
const TOKEN_KEY = 'veille-kanban.token';

export interface TokenStorage {
  /** The token in store, or null when there is none to be had. */
  read(): string | null;

  /** True when the token was really stored. See the note on failure below. */
  write(token: string): boolean;

  /** Removes our key, and only ours. */
  clear(): void;
}

/**
 * Builds the token accessor over a given storage.
 *
 * The parameter defaults to localStorage, so the application passes nothing
 * and reads exactly like ADR-016 says. Tests pass their own object instead,
 * which is what lets them simulate a storage that refuses every access
 * without touching a global or installing a DOM.
 *
 * This is the same injection as createHttpClient, createApiStorage and
 * createMemoryStorage: one idea, applied four times.
 */
export function createTokenStorage(
  store: Storage = globalThis.localStorage,
): TokenStorage {
  // Reaching a storage can THROW, not merely return nothing: private
  // browsing, storage blocked by policy, quota reached on write. The read
  // happens while the application boots, so an unguarded access there is a
  // white screen before anything is ever displayed.
  return {
    read: (): string | null => {
      try {
        const token = store.getItem(TOKEN_KEY);

        // An empty string is treated as an absence. Without this, the HTTP
        // client would see a non null value and send "Authorization: Bearer ",
        // a malformed header answered with an unhelpful 401.
        return token === null || token === '' ? null : token;
      } catch {
        // null already means "no session", so asking for a login again is
        // the degraded behaviour the ticket allows.
        return null;
      }
    },

    write: (token: string): boolean => {
      try {
        store.setItem(TOKEN_KEY, token);
        return true;
      } catch {
        // Swallowed but REPORTED, and that asymmetry is deliberate: staying
        // silent here would let a login present itself as successful while
        // the next reload logs the user out with no explanation. The caller
        // decides what to say, see use-auth.ts at FRONT-31.
        return false;
      }
    },

    clear: (): void => {
      try {
        // removeItem, never store.clear(): the latter wipes every key of the
        // origin, including those of another application on the same port.
        store.removeItem(TOKEN_KEY);
      } catch {
        // A storage we cannot reach holds nothing to leak, and a logout must
        // never fail in the user's face.
      }
    },
  };
}
