// The composition root: the single place where the four factories meet.
//
// This is the literal answer to "if you swapped your data source tomorrow,
// how many files would you touch": this one. Replacing createApiStorage with
// createMemoryStorage below gives a fully working application with no
// network, and nothing else in the project changes, because nothing else
// knows which implementation it was handed.
//
// It is a FUNCTION and not a set of module level constants, for one concrete
// reason: composing at import time would throw before main.tsx could catch
// it, and a configuration mistake would show up as a blank page with a
// console message instead of a readable sentence on screen.
//
// No unit test here, and that is a choice rather than an omission: this file
// contains no decision, only wiring. What would be tested is that four
// functions are called, which is what reading the eight lines already shows.
// It is verified by the application starting, at FRONT-32.

import { createAuthApi, type AuthApi } from './api/auth-api.ts';
import { createHttpClient } from './api/http-client.ts';
import { createAuthEvents, type AuthEvents } from './auth/auth-events.ts';
import { createTokenStorage, type TokenStorage } from './auth/token-storage.ts';
import { requireApiBaseUrl } from './config.ts';
import { createApiStorage } from './storage/api-storage.ts';
import type { BoardStorage } from './storage/storage.ts';

export interface Services {
  tokens: TokenStorage;
  events: AuthEvents;
  authApi: AuthApi;
  boardStorage: BoardStorage;
}

/** Builds everything the application needs, or throws a readable message. */
export function createServices(rawBaseUrl: string | undefined): Services {
  const baseUrl = requireApiBaseUrl(rawBaseUrl);
  const tokens = createTokenStorage();
  const events = createAuthEvents();

  // tokens.read is passed BY REFERENCE, which only works because the token
  // storage returns closures and has no `this`. A class method handed over
  // like this would lose its receiver and break at the first request.
  //
  // The client reports a dead session, the auth module decides what that
  // means: here the notifier is handed over directly, and use-auth is the
  // one that purges.
  const client = createHttpClient(baseUrl, tokens.read, events.emitUnauthorized);

  return {
    tokens,
    events,
    authApi: createAuthApi(client),
    boardStorage: createApiStorage(client),
  };
}
