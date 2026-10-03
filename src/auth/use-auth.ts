// Where authentication meets React. The only file in src/auth/ that imports
// React, and it holds no business rule of its own: it turns three injected
// collaborators into a state the interface can render.
//
// WHAT IT DELIBERATELY DOES NOT HOLD: the token value. It travels from the
// storage to the HTTP client and never passes through React state, where it
// would show up in a dev tool, a serialised error or a log. The hook knows
// whether there is a token, never which one.
//
// NO LOADING EFFECT HERE, and that is worth knowing before hunting a bug
// that does not exist: reading the token is synchronous, so the initial
// state is computed by useState and no useEffect is involved. React strict
// mode runs effects twice in development, which with fetch shows up as two
// requests in the network tab; that will happen in use-board at FRONT-10,
// not here.

import { useCallback, useEffect, useState } from 'react';

import type { AuthApi } from '../api/auth-api.ts';
import { messageOf } from '../api/error-message.ts';
import type { AuthEvents } from './auth-events.ts';
import type { TokenStorage } from './token-storage.ts';

export type AuthStatus = 'anonymous' | 'authenticated';

export interface UseAuthDeps {
  tokens: TokenStorage;
  authApi: AuthApi;
  events: AuthEvents;
}

export interface Auth {
  status: AuthStatus;
  pending: boolean;
  error: string | null;
  signIn(email: string, password: string): Promise<void>;
  signOut(): void;
}

const STORAGE_REFUSED =
  "Connexion impossible : ce navigateur refuse d'enregistrer la session.";

export function useAuth({ tokens, authApi, events }: UseAuthDeps): Auth {
  // The function form runs once, at mount. Holding a token is treated as
  // being authenticated, which is OPTIMISTIC on purpose: an expired or
  // tampered token starts the application as connected and the first 401
  // corrects it. That is ADR-017, the trust boundary is the server.
  const [status, setStatus] = useState<AuthStatus>(() =>
    tokens.read() === null ? 'anonymous' : 'authenticated',
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The purge lives HERE and nowhere else, so there is one place that knows
  // what losing a session means. It does not touch the error message: a 401
  // can arrive while a login is failing, and wiping the message would leave
  // the user with no explanation.
  const forget = useCallback((): void => {
    tokens.clear();
    setStatus('anonymous');
  }, [tokens]);

  // subscribe returns its own unsubscriber, which becomes the cleanup React
  // runs on unmount. This is the entire mechanism behind the expired token
  // during the oral: nothing in the interface calls signOut, the notifier
  // does, from inside whatever request got the 401.
  useEffect(() => events.subscribe(forget), [events, forget]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<void> => {
      setPending(true);
      // Cleared on every attempt: without this, a corrected password would
      // succeed with "Identifiants invalides" still on screen.
      setError(null);

      try {
        const token = await authApi.login(email, password);

        // The boolean from token-storage.write, FRONT-30. Announcing success
        // here would log the user out at the next reload with no reason
        // given, so a session we could not remember is not a session.
        if (!tokens.write(token)) {
          setError(STORAGE_REFUSED);
          return;
        }

        setStatus('authenticated');
      } catch (caught) {
        // A wrong password answers 401, which also fires the global notifier
        // and therefore forget(). Harmless, there is nothing to purge and the
        // status is already anonymous, and the message set here survives it
        // because forget() leaves the error alone.
        setError(messageOf(caught));
      } finally {
        // In a finally, so the button stops spinning whether the call
        // succeeded, was refused, or never reached the server.
        setPending(false);
      }
    },
    [authApi, tokens],
  );

  const signOut = useCallback((): void => {
    forget();
    setError(null);
  }, [forget]);

  // Nothing here clears the board: the board is mounted inside the
  // authenticated branch of the conditional render, so turning anonymous
  // unmounts it and React discards its state. The unmount IS the purge.
  return { status, pending, error, signIn, signOut };
}
