// The specification of token-storage.ts, written before it exists.
//
// Every test injects a fake Storage. Nothing here touches a browser, a real
// localStorage or a global: that is the whole point of the factory taking its
// store as a parameter. Building a localStorage that throws on demand is
// awkward under jsdom and trivial with an object literal, and the two failure
// tests below are exactly what the ticket asks us to prove.

import { describe, expect, it } from 'vitest';

import { createTokenStorage } from './token-storage.ts';

/** The key the module is expected to use. Spelled out, never imported. */
const EXPECTED_KEY = 'veille-kanban.token';

type FakeStorage = Storage & { readonly entries: Map<string, string> };

/**
 * A Storage backed by a Map, whose content stays readable by the test.
 *
 * Asserting on `entries` rather than on getItem matters for the purge: a read
 * that returns null proves nothing about whether the key is gone.
 */
function createFakeStorage(initial: Record<string, string> = {}): FakeStorage {
  const entries = new Map(Object.entries(initial));

  return {
    entries,
    get length(): number {
      return entries.size;
    },
    getItem: (key: string): string | null => entries.get(key) ?? null,
    setItem: (key: string, value: string): void => {
      entries.set(key, value);
    },
    removeItem: (key: string): void => {
      entries.delete(key);
    },
    clear: (): void => {
      entries.clear();
    },
    key: (index: number): string | null =>
      [...entries.keys()][index] ?? null,
  };
}

/**
 * A Storage that refuses every access, like private browsing or a storage
 * blocked by policy. A DOMException is what browsers actually throw here,
 * so that is what we simulate.
 */
function createThrowingStorage(): Storage {
  function fail(): never {
    throw new DOMException('Le stockage est indisponible.', 'SecurityError');
  }

  return {
    // The module never reads length, so a fixed value keeps the fake simple.
    length: 0,
    getItem: fail,
    setItem: fail,
    removeItem: fail,
    clear: fail,
    key: fail,
  };
}

describe('createTokenStorage', () => {
  describe('la lecture', () => {
    it("rend null quand aucun jeton n'est rangé", () => {
      const tokens = createTokenStorage(createFakeStorage());

      expect(tokens.read()).toBeNull();
    });

    it('rend la valeur rangée, à l\'identique', () => {
      const store = createFakeStorage();
      const tokens = createTokenStorage(store);

      tokens.write('un.jeton.quelconque');

      expect(tokens.read()).toBe('un.jeton.quelconque');
    });

    it('traite une chaîne vide comme une absence de jeton', () => {
      // Without this, the HTTP client would see a non null value and send
      // "Authorization: Bearer ", a malformed header answered with an
      // unhelpful 401.
      const tokens = createTokenStorage(
        createFakeStorage({ [EXPECTED_KEY]: '' }),
      );

      expect(tokens.read()).toBeNull();
    });

    it('rend null sans propager quand le stockage lève', () => {
      const tokens = createTokenStorage(createThrowingStorage());

      expect(() => tokens.read()).not.toThrow();
      expect(tokens.read()).toBeNull();
    });
  });

  describe("l'écriture", () => {
    it('range le jeton sous la clé préfixée du projet', () => {
      // A bare "token" key would be shared with every other Vite project
      // served on localhost:5173, since localStorage is scoped to the origin.
      const store = createFakeStorage();
      const tokens = createTokenStorage(store);

      tokens.write('un.jeton.quelconque');

      expect(store.entries.get(EXPECTED_KEY)).toBe('un.jeton.quelconque');
    });

    it('remplace le jeton précédent, cas de la reconnexion', () => {
      const store = createFakeStorage();
      const tokens = createTokenStorage(store);

      tokens.write('premier.jeton');
      tokens.write('second.jeton');

      expect(tokens.read()).toBe('second.jeton');
      expect(store.entries.size).toBe(1);
    });

    it('signale le succès', () => {
      const tokens = createTokenStorage(createFakeStorage());

      expect(tokens.write('un.jeton.quelconque')).toBe(true);
    });

    it('signale l\'échec sans propager quand le stockage lève', () => {
      // The caller has to know: a login that could not be remembered must
      // not present itself as a success, or the user is logged out at the
      // next reload with no explanation.
      const tokens = createTokenStorage(createThrowingStorage());

      expect(tokens.write('un.jeton.quelconque')).toBe(false);
    });
  });

  describe('la purge', () => {
    it('fait réellement disparaître la clé du stockage', () => {
      const store = createFakeStorage();
      const tokens = createTokenStorage(store);
      tokens.write('un.jeton.quelconque');

      tokens.clear();

      expect(store.entries.has(EXPECTED_KEY)).toBe(false);
    });

    it('ne touche pas aux autres clés de la même origine', () => {
      // Implementing the purge with store.clear() would wipe every key of
      // the origin, including those of another application served on the
      // same port. Only our own key is ours to delete.
      const store = createFakeStorage({ 'une-autre-app.preference': 'sombre' });
      const tokens = createTokenStorage(store);
      tokens.write('un.jeton.quelconque');

      tokens.clear();

      expect(store.entries.get('une-autre-app.preference')).toBe('sombre');
    });

    it('ne propage pas quand le stockage lève', () => {
      // A storage we cannot reach holds nothing to leak, and a logout must
      // never fail in the user's face.
      const tokens = createTokenStorage(createThrowingStorage());

      expect(() => tokens.clear()).not.toThrow();
    });
  });
});
