// @vitest-environment jsdom
//
// Specification of the hook, written before it exists.
//
// EVERY TEST HANDS IT THE IN MEMORY ADAPTER, and that is not a convenience:
// it is the proof of the architecture criterion. The hook never learns
// whether it is talking to an API or to a Map, because BoardStorage says
// nothing about either. This file is the executable version of the answer to
// "how many files would you touch to swap your data source".

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api/http-client.ts';
import type { Board } from '../domain/types.ts';
import { createMemoryStorage } from '../storage/memory-storage.ts';
import type { BoardStorage } from '../storage/storage.ts';
import { useBoard } from './use-board.ts';

/** Ids prefixed so they cannot collide with those the double generates. */
const seeded: Board = {
  lists: [{ id: 'seed-list-1', title: 'A faire', position: 0 }],
  cards: [
    {
      id: 'seed-card-1',
      title: 'Ecrire les tests',
      description: '',
      position: 0,
      listId: 'seed-list-1',
    },
  ],
};

/** A storage whose load refuses, for the API down case. */
function storageFailingToLoad(): BoardStorage {
  return {
    ...createMemoryStorage(),
    load: () => Promise.reject(new ApiError('network', ['Le serveur est injoignable.'])),
  };
}

async function mountReady(storage: BoardStorage) {
  const mounted = renderHook(() => useBoard(storage));
  await waitFor(() => expect(mounted.result.current.status).toBe('ready'));

  return mounted;
}

describe('le chargement initial', () => {
  it('commence en chargement, et ne pretend pas que le tableau est vide', () => {
    // Asserted BEFORE any await: this is the frame the user actually sees
    // first, and the one where an interface wrongly says "aucune colonne".
    //
    // The storage is built OUTSIDE the render callback on purpose. Built
    // inside, it would be a new object on every render, the load effect
    // would see a changed dependency, reload, dispatch, render again, and
    // the process would abort on an infinite loop. The hook requires a
    // stable storage, which the composition root guarantees.
    const storage = createMemoryStorage(seeded);
    const { result } = renderHook(() => useBoard(storage));

    expect(result.current.status).toBe('loading');
  });

  it('passe a ready avec ce que le stockage contient', async () => {
    const { result } = await mountReady(createMemoryStorage(seeded));

    expect(result.current.board.lists).toHaveLength(1);
    expect(result.current.board.cards).toHaveLength(1);
  });

  it('passe a error avec un message quand le chargement echoue', async () => {
    const storage = storageFailingToLoad();
    const { result } = renderHook(() => useBoard(storage));

    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Le serveur est injoignable.');
  });

  it('ne plante pas quand le composant est demonte avant la reponse', async () => {
    // Honest about what this proves: React 19 no longer warns on a state
    // update after unmount, so this test would not catch a missing cleanup
    // by itself. It catches a crash, and it states the intent.
    let release: (board: Board) => void = () => {};
    const storage: BoardStorage = {
      ...createMemoryStorage(),
      load: () =>
        new Promise<Board>((resolve) => {
          release = resolve;
        }),
    };
    const { result, unmount } = renderHook(() => useBoard(storage));

    unmount();
    await act(async () => {
      release(seeded);
    });

    expect(result.current.status).toBe('loading');
  });
});

describe('ajouter une colonne', () => {
  it('fait apparaitre la colonne rendue par le stockage', async () => {
    const { result } = await mountReady(createMemoryStorage(seeded));

    await act(async () => {
      await result.current.addList('En cours');
    });

    expect(result.current.board.lists).toHaveLength(2);
    expect(
      result.current.board.lists.some((list) => list.title === 'En cours'),
    ).toBe(true);
  });

  it("n'appelle pas le stockage quand le titre est vide ou blanc", async () => {
    // Not a duplicate of a server rule: a blank title has no chance of being
    // accepted, so the round trip is not worth making. isBlankTitle comes
    // from src/domain, written at lot 1 and unused until now.
    const storage = createMemoryStorage(seeded);
    const addList = vi.spyOn(storage, 'addList');
    const { result } = await mountReady(storage);

    await act(async () => {
      await result.current.addList('   ');
    });

    expect(addList).not.toHaveBeenCalled();
    expect(result.current.board.lists).toHaveLength(1);
  });
});

describe('les autres actions', () => {
  it('ajoute une carte dans la bonne colonne', async () => {
    const { result } = await mountReady(createMemoryStorage(seeded));

    await act(async () => {
      await result.current.addCard('seed-list-1', 'Relire');
    });

    expect(result.current.board.cards).toHaveLength(2);
  });

  it('remplace la carte modifiee sans en ajouter une', async () => {
    const { result } = await mountReady(createMemoryStorage(seeded));

    await act(async () => {
      await result.current.updateCard('seed-card-1', { title: 'Titre corrige' });
    });

    expect(result.current.board.cards).toHaveLength(1);
    expect(result.current.board.cards[0]?.title).toBe('Titre corrige');
  });

  it('retire la carte supprimee', async () => {
    const { result } = await mountReady(createMemoryStorage(seeded));

    await act(async () => {
      await result.current.deleteCard('seed-card-1');
    });

    expect(result.current.board.cards).toHaveLength(0);
  });
});

describe('une action qui echoue', () => {
  it('laisse le tableau intact et informe', async () => {
    // The double raises notFound on an unknown id, exactly as the API
    // answers 404. That is what makes it a double rather than a stub.
    const { result } = await mountReady(createMemoryStorage(seeded));

    await act(async () => {
      await result.current.deleteCard('carte-qui-n-existe-pas');
    });

    expect(result.current.board.cards).toHaveLength(1);
    expect(result.current.error).not.toBeNull();
    expect(result.current.status).toBe('ready');
  });
});

// Added at pass B of lot 5. The four methods now report whether they
// succeeded, so TitleForm can clear its field on success and KEEP what the
// user typed on failure. Four lines in the hook, and the ten tests above
// were unaffected, which is what makes the change safe to make on a closed
// ticket.
describe('le resultat rendu par les actions', () => {
  it('rend true quand l\'action aboutit', async () => {
    const { result } = await mountReady(createMemoryStorage(seeded));
    let outcome: unknown;

    await act(async () => {
      outcome = await result.current.addList('En cours');
    });

    expect(outcome).toBe(true);
  });

  it('rend false quand le serveur refuse', async () => {
    const { result } = await mountReady(createMemoryStorage(seeded));
    let outcome: unknown;

    await act(async () => {
      outcome = await result.current.deleteCard('carte-qui-n-existe-pas');
    });

    expect(outcome).toBe(false);
  });

  it('rend false quand le titre est refuse avant le reseau', async () => {
    // Nothing was created, so the form must keep the text. A blank title and
    // a server refusal are two failures, and they deserve the same answer.
    const { result } = await mountReady(createMemoryStorage(seeded));
    let outcome: unknown;

    await act(async () => {
      outcome = await result.current.addList('   ');
    });

    expect(outcome).toBe(false);
  });
});
