// @vitest-environment jsdom
//
// Specification of the authentication hook, written before it exists.
//
// This is the FIRST test file of the project needing a DOM, because it mounts
// a React hook. The directive above gives one to THIS file alone: the other
// 97 tests keep running in Node, which is not only faster but keeps a module
// that needs no browser from quietly starting to depend on one.
//
// Everything the hook talks to is injected: a fake token storage, a fake auth
// API, a real notifier. No network, no localStorage, no server.

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api/http-client.ts';
import { createAuthEvents } from './auth-events.ts';
import type { TokenStorage } from './token-storage.ts';
import { useAuth } from './use-auth.ts';

/** A token storage in a plain variable, with the real interface. */
function fakeTokens(
  initial: string | null = null,
  writeSucceeds = true,
): TokenStorage & { value: string | null } {
  return {
    value: initial,
    read(): string | null {
      return this.value;
    },
    write(token: string): boolean {
      if (!writeSucceeds) {
        return false;
      }

      this.value = token;
      return true;
    },
    clear(): void {
      this.value = null;
    },
  };
}

let events: ReturnType<typeof createAuthEvents>;

beforeEach(() => {
  events = createAuthEvents();
});

function mount(
  tokens: TokenStorage,
  login: (email: string, password: string) => Promise<string> = vi.fn(),
) {
  return renderHook(() => useAuth({ tokens, authApi: { login }, events }));
}

describe('au demarrage', () => {
  it("est anonyme quand aucun jeton n'est range", () => {
    const { result } = mount(fakeTokens(null));

    expect(result.current.status).toBe('anonymous');
  });

  it('est authentifie quand un jeton est deja range, sans ressaisie', () => {
    // "Considered" authenticated: holding a token is not being authenticated,
    // the token may be expired or forged. The first 401 corrects that, which
    // is the tampered token case below. This is ADR-017.
    const { result } = mount(fakeTokens('un.jeton.deja.la'));

    expect(result.current.status).toBe('authenticated');
  });

  it("n'expose jamais la valeur du jeton", () => {
    // Security criterion: the token travels from storage to the HTTP client
    // and never through React state, where it would end up in a dev tool,
    // a log or a serialised error.
    const { result } = mount(fakeTokens('un.jeton.deja.la'));

    expect(Object.values(result.current)).not.toContain('un.jeton.deja.la');
  });
});

describe('la connexion', () => {
  it('range le jeton et passe authentifie', async () => {
    const tokens = fakeTokens(null);
    const login = vi.fn().mockResolvedValue('jeton.frais');
    const { result } = mount(tokens, login);

    await act(async () => {
      await result.current.signIn('user1@example.com', 'motdepasse123');
    });

    expect(login).toHaveBeenCalledWith('user1@example.com', 'motdepasse123');
    expect(tokens.value).toBe('jeton.frais');
    expect(result.current.status).toBe('authenticated');
  });

  it('affiche le message du serveur quand les identifiants sont refuses', async () => {
    const tokens = fakeTokens(null);
    const login = vi
      .fn()
      .mockRejectedValue(new ApiError('unauthorized', ['Identifiants invalides.']));
    const { result } = mount(tokens, login);

    await act(async () => {
      await result.current.signIn('user1@example.com', 'faux');
    });

    expect(result.current.error).toBe('Identifiants invalides.');
    expect(result.current.status).toBe('anonymous');
    expect(tokens.value).toBeNull();
  });

  it('signale un echec quand le stockage refuse de ranger le jeton', async () => {
    // The false returned by token-storage.write, FRONT-30. Announcing a
    // successful login here would log the user out at the next reload with
    // no explanation.
    const tokens = fakeTokens(null, false);
    const { result } = mount(tokens, vi.fn().mockResolvedValue('jeton.frais'));

    await act(async () => {
      await result.current.signIn('user1@example.com', 'motdepasse123');
    });

    expect(result.current.status).toBe('anonymous');
    expect(result.current.error).not.toBeNull();
  });

  it('expose une connexion en cours, pour empecher le double envoi', async () => {
    // Without this, two quick clicks send two login requests. With the
    // localStorage it was instantaneous and invisible; with a round trip it
    // is easy to trigger.
    let release: (token: string) => void = () => {};
    const login = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    const { result } = mount(fakeTokens(null), login);

    act(() => {
      void result.current.signIn('user1@example.com', 'motdepasse123');
    });
    expect(result.current.pending).toBe(true);

    await act(async () => {
      release('jeton.frais');
    });
    expect(result.current.pending).toBe(false);
  });

  it('efface le message precedent quand on retente', async () => {
    const login = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('unauthorized', ['Identifiants invalides.']))
      .mockResolvedValueOnce('jeton.frais');
    const { result } = mount(fakeTokens(null), login);

    await act(async () => {
      await result.current.signIn('user1@example.com', 'faux');
    });
    await act(async () => {
      await result.current.signIn('user1@example.com', 'motdepasse123');
    });

    expect(result.current.error).toBeNull();
    expect(result.current.status).toBe('authenticated');
  });
});

describe('la deconnexion', () => {
  it('purge le jeton et repasse anonyme', () => {
    const tokens = fakeTokens('un.jeton.deja.la');
    const { result } = mount(tokens);

    act(() => {
      result.current.signOut();
    });

    expect(tokens.value).toBeNull();
    expect(result.current.status).toBe('anonymous');
  });
});

describe('le 401 venu de nulle part', () => {
  it('repasse anonyme quand un 401 est emis pendant la session', () => {
    // The expired token case, and it WILL happen at the oral: the JWT lasts
    // one hour. Nothing here calls signOut, the notifier does.
    const tokens = fakeTokens('un.jeton.qui.expire');
    const { result } = mount(tokens);

    act(() => {
      events.emitUnauthorized();
    });

    expect(result.current.status).toBe('anonymous');
  });

  it('cesse d\'ecouter apres demontage', () => {
    // A listener left behind would try to set state on an unmounted hook.
    const { result, unmount } = mount(fakeTokens('un.jeton'));

    unmount();

    expect(() => {
      act(() => {
        events.emitUnauthorized();
      });
    }).not.toThrow();
    expect(result.current.status).toBe('authenticated');
  });
});
