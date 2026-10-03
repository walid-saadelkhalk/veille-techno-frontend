// @vitest-environment jsdom
//
// Specification of the conditional render, which is what replaces the router
// cut by ADR-021. There is no /login route and no redirection: the shell
// shows the form or the board, and the criterion "I am redirected to the
// board" is satisfied by a branch, not by a URL change.
//
// Worth noting what these two tests run on: a real useAuth, a real notifier,
// and the IN MEMORY board adapter. The whole application boots here with no
// network, no server and no database, which is the demonstration ADR-004 was
// written for.

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import App from './App.tsx';
import type { TokenStorage } from './auth/token-storage.ts';
import { createAuthEvents } from './auth/auth-events.ts';
import { createMemoryStorage } from './storage/memory-storage.ts';
import type { Services } from './services.ts';

// See the note in LoginForm.test.tsx: without this the rendered shells pile
// up in the document and the queries become ambiguous.
afterEach(cleanup);

function tokenStorageHolding(token: string | null): TokenStorage {
  let held = token;

  return {
    read: () => held,
    write: (value: string) => {
      held = value;
      return true;
    },
    clear: () => {
      held = null;
    },
  };
}

function servicesWith(token: string | null): Services {
  return {
    tokens: tokenStorageHolding(token),
    events: createAuthEvents(),
    authApi: { login: vi.fn() },
    boardStorage: createMemoryStorage(),
  };
}

describe('App', () => {
  it("affiche l'ecran de connexion quand aucun jeton n'est range", () => {
    render(<App services={servicesWith(null)} />);

    expect(screen.getByLabelText(/email/i)).toBeTruthy();
  });

  it('affiche le tableau quand un jeton est deja range', () => {
    render(<App services={servicesWith('un.jeton.deja.la')} />);

    expect(screen.getByRole('heading', { name: /tableau/i })).toBeTruthy();
    expect(screen.queryByLabelText(/email/i)).toBeNull();
  });

  it('offre un moyen de se deconnecter', () => {
    // Without a button, the logout delivered at FRONT-31 cannot be observed,
    // and neither can the criterion that says the board must not come back.
    render(<App services={servicesWith('un.jeton.deja.la')} />);

    expect(
      // Accented, because the button says it to a user. The rest of this
      // file stays unaccented, like every other test name in the project.
      screen.getByRole('button', { name: /se déconnecter/i }),
    ).toBeTruthy();
  });
});
