// Specification of the notifier that carries a 401 from the HTTP client to
// React, written before it exists.
//
// It exists because the purge has to happen on ANY 401, and asking every
// caller to remember would make a forgotten call a silent security hole. One
// notifier, created once at composition, is impossible to forget.

import { describe, expect, it, vi } from 'vitest';

import { createAuthEvents } from './auth-events.ts';

describe('createAuthEvents', () => {
  it("previent l'abonne quand un 401 est emis", () => {
    const events = createAuthEvents();
    const listener = vi.fn();
    events.subscribe(listener);

    events.emitUnauthorized();

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('previent tous les abonnes', () => {
    const events = createAuthEvents();
    const first = vi.fn();
    const second = vi.fn();
    events.subscribe(first);
    events.subscribe(second);

    events.emitUnauthorized();

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('cesse de prevenir apres desabonnement', () => {
    // The returned function is what useEffect will give back as its cleanup.
    // Without it, a remounted hook would stack listeners for ever.
    const events = createAuthEvents();
    const listener = vi.fn();
    const unsubscribe = events.subscribe(listener);

    unsubscribe();
    events.emitUnauthorized();

    expect(listener).not.toHaveBeenCalled();
  });

  it("ne leve pas quand personne n'est abonne", () => {
    const events = createAuthEvents();

    expect(() => events.emitUnauthorized()).not.toThrow();
  });
});
