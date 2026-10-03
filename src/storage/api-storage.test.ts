// Specification of the API adapter. Written before the implementation and
// watched failing first.
//
// The HTTP client is replaced by a fake: it has its own 19 tests, and
// retesting it here would couple two files for nothing. What is verified here
// is the mapping onto routes, and the fact that nothing the API adds can leak
// into the domain.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { HttpClient } from '../api/http-client.ts';
import { ApiError } from '../api/http-client.ts';
import type { BoardStorage } from './storage.ts';
import { createApiStorage } from './api-storage.ts';

type ClientMock = {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

let client: ClientMock;

function storage(): BoardStorage {
  return createApiStorage(client as unknown as HttpClient);
}

// Exactly what the API sends, extra fields included. The point of several
// tests below is that these extras never reach the domain.
const listDto = {
  id: 'list-1',
  title: 'A faire',
  position: 0,
  ownerId: 'owner-1',
  createdAt: '2026-09-27T16:03:44.361Z',
};

const cardDto = {
  id: 'card-1',
  title: 'Une tache',
  description: '',
  position: 0,
  listId: 'list-1',
  createdAt: '2026-09-27T16:03:44.361Z',
  updatedAt: '2026-09-27T16:03:44.361Z',
};

beforeEach(() => {
  client = { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() };
});

describe('load', () => {
  it('appelle GET /lists puis une requete de cartes par colonne', async () => {
    client.get
      .mockResolvedValueOnce([listDto, { ...listDto, id: 'list-2' }])
      .mockResolvedValue([]);

    await storage().load();

    expect(client.get).toHaveBeenCalledWith('/lists');
    expect(client.get).toHaveBeenCalledWith('/lists/list-1/cards');
    expect(client.get).toHaveBeenCalledWith('/lists/list-2/cards');
    expect(client.get).toHaveBeenCalledTimes(3);
  });

  it('rend un Board portant les colonnes et les cartes', async () => {
    client.get.mockResolvedValueOnce([listDto]).mockResolvedValue([cardDto]);

    const board = await storage().load();

    expect(board.lists).toHaveLength(1);
    expect(board.cards).toHaveLength(1);
    expect(board.lists[0]?.title).toBe('A faire');
    expect(board.cards[0]?.listId).toBe('list-1');
  });

  it('rassemble les cartes de toutes les colonnes dans une seule collection', async () => {
    client.get
      .mockResolvedValueOnce([listDto, { ...listDto, id: 'list-2' }])
      .mockResolvedValueOnce([cardDto])
      .mockResolvedValueOnce([{ ...cardDto, id: 'card-2', listId: 'list-2' }]);

    const board = await storage().load();

    expect(board.cards.map((card) => card.id)).toEqual(['card-1', 'card-2']);
  });

  it('ne fait qu_une seule requete quand il n_y a aucune colonne', async () => {
    client.get.mockResolvedValueOnce([]);

    const board = await storage().load();

    expect(client.get).toHaveBeenCalledTimes(1);
    expect(board.lists).toEqual([]);
    expect(board.cards).toEqual([]);
  });

  // The N+1 is unavoidable, there is no global GET /cards. Issuing the card
  // requests together rather than one after the other turns N round trips
  // into one.
  it('lance les requetes de cartes ensemble, pas en file', async () => {
    const pending: Array<() => void> = [];
    client.get
      .mockResolvedValueOnce([
        listDto,
        { ...listDto, id: 'list-2' },
        { ...listDto, id: 'list-3' },
      ])
      .mockImplementation(
        () =>
          new Promise<unknown[]>((resolve) => {
            pending.push(() => {
              resolve([]);
            });
          }),
      );

    const loading = storage().load();
    await vi.waitFor(() => {
      expect(pending).toHaveLength(3);
    });

    pending.forEach((release) => {
      release();
    });
    await loading;
  });

  // The whole point of the mapping: an extra field on the API side cannot
  // reach the domain, today or when a column is added to the response.
  it('ignore les champs que l_API ajoute, sur une colonne', async () => {
    client.get.mockResolvedValueOnce([listDto]).mockResolvedValue([]);

    const board = await storage().load();

    expect(Object.keys(board.lists[0] ?? {}).sort()).toEqual([
      'id',
      'position',
      'title',
    ]);
  });

  it('ignore les champs que l_API ajoute, sur une carte', async () => {
    client.get.mockResolvedValueOnce([listDto]).mockResolvedValue([cardDto]);

    const board = await storage().load();

    expect(Object.keys(board.cards[0] ?? {}).sort()).toEqual([
      'description',
      'id',
      'listId',
      'position',
      'title',
    ]);
  });

  // ADR-019 puts sorting at read time, in sortedLists and cardsOfList.
  // Sorting here too would be a second place where the order could drift.
  it('ne trie pas, le tri appartient au domaine', async () => {
    client.get
      .mockResolvedValueOnce([
        { ...listDto, id: 'list-2', position: 5 },
        { ...listDto, id: 'list-1', position: 0 },
      ])
      .mockResolvedValue([]);

    const board = await storage().load();

    expect(board.lists.map((list) => list.id)).toEqual(['list-2', 'list-1']);
  });
});

describe('addList', () => {
  it('appelle POST /lists avec le seul titre', async () => {
    client.post.mockResolvedValue(listDto);

    await storage().addList('A faire');

    expect(client.post).toHaveBeenCalledWith('/lists', { title: 'A faire' });
  });

  it('n_envoie aucun identifiant, le serveur le genere', async () => {
    client.post.mockResolvedValue(listDto);

    await storage().addList('A faire');

    const body = client.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['title']);
  });

  it('rend la colonne telle que le serveur la renvoie, champs en trop retires', async () => {
    client.post.mockResolvedValue(listDto);

    const list = await storage().addList('A faire');

    expect(list).toEqual({ id: 'list-1', title: 'A faire', position: 0 });
  });
});

describe('addCard', () => {
  it('appelle POST /lists/:listId/cards avec le seul titre', async () => {
    client.post.mockResolvedValue(cardDto);

    await storage().addCard('list-1', 'Une tache');

    expect(client.post).toHaveBeenCalledWith('/lists/list-1/cards', {
      title: 'Une tache',
    });
  });

  // The server applies @default("") on description. Sending one would be
  // duplicating a server rule on the client, where it could drift.
  it('n_envoie pas de description, le serveur la met a vide', async () => {
    client.post.mockResolvedValue(cardDto);

    await storage().addCard('list-1', 'Une tache');

    const body = client.post.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['title']);
  });

  it('rend la carte avec une description vide', async () => {
    client.post.mockResolvedValue(cardDto);

    const card = await storage().addCard('list-1', 'Une tache');

    expect(card.description).toBe('');
    expect(card.listId).toBe('list-1');
  });
});

describe('updateCard', () => {
  it('appelle PATCH /cards/:id avec le patch', async () => {
    client.patch.mockResolvedValue({ ...cardDto, title: 'Apres' });

    await storage().updateCard('card-1', { title: 'Apres' });

    expect(client.patch).toHaveBeenCalledWith('/cards/card-1', {
      title: 'Apres',
    });
  });

  it('n_envoie que les champs presents dans le patch', async () => {
    client.patch.mockResolvedValue(cardDto);

    await storage().updateCard('card-1', { description: 'Ajoutee' });

    const body = client.patch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(body)).toEqual(['description']);
  });

  it('rend la carte telle que le serveur la renvoie apres modification', async () => {
    client.patch.mockResolvedValue({ ...cardDto, title: 'Apres' });

    const card = await storage().updateCard('card-1', { title: 'Apres' });

    expect(card.title).toBe('Apres');
    expect(Object.keys(card)).toHaveLength(5);
  });
});

describe('deleteCard', () => {
  it('appelle DELETE /cards/:id', async () => {
    client.delete.mockResolvedValue(undefined);

    await storage().deleteCard('card-1');

    expect(client.delete).toHaveBeenCalledWith('/cards/card-1');
  });

  it('ne rend rien', async () => {
    client.delete.mockResolvedValue(undefined);

    await expect(storage().deleteCard('card-1')).resolves.toBeUndefined();
  });
});

describe('erreurs', () => {
  it('laisse remonter un 403 sans le transformer', async () => {
    client.patch.mockRejectedValue(new ApiError('forbidden', ['Interdit.']));

    await expect(
      storage().updateCard('card-1', { title: 'x' }),
    ).rejects.toMatchObject({ kind: 'forbidden' });
  });

  // A partial board would be worse than an error: the user would believe the
  // board complete while a column is missing.
  it('fait echouer tout le chargement si une requete de cartes echoue', async () => {
    client.get
      .mockResolvedValueOnce([listDto, { ...listDto, id: 'list-2' }])
      .mockResolvedValueOnce([cardDto])
      .mockRejectedValueOnce(new ApiError('server', ['Erreur serveur.']));

    await expect(storage().load()).rejects.toBeInstanceOf(ApiError);
  });
});

// Added at FRONT-37.
describe('updateList', () => {
  it('envoie le patch a PATCH /lists/:id et rend la colonne du serveur', async () => {
    client.patch.mockResolvedValue({ ...listDto, title: 'Titre corrige' });

    const list = await storage().updateList('list-1', { title: 'Titre corrige' });

    expect(client.patch).toHaveBeenCalledWith('/lists/list-1', {
      title: 'Titre corrige',
    });
    expect(list.title).toBe('Titre corrige');
  });

  it('ne laisse pas passer ownerId ni createdAt dans le domaine', async () => {
    client.patch.mockResolvedValue({ ...listDto, title: 'Titre corrige' });

    const list = await storage().updateList('list-1', { title: 'Titre corrige' });

    expect(Object.keys(list).sort()).toEqual(['id', 'position', 'title']);
  });

  it("laisse passer l'erreur du client sans la transformer", async () => {
    const refused = new ApiError('forbidden', [
      'Cette liste appartient a un autre utilisateur.',
    ]);
    client.patch.mockRejectedValue(refused);

    await expect(storage().updateList('list-1', { title: 'x' })).rejects.toBe(
      refused,
    );
  });
});

describe('deleteList', () => {
  it('appelle DELETE /lists/:id', async () => {
    client.delete.mockResolvedValue(undefined);

    await storage().deleteList('list-1');

    expect(client.delete).toHaveBeenCalledWith('/lists/list-1');
  });

  it("ne rend rien, le serveur repondant 204 sans corps", async () => {
    client.delete.mockResolvedValue(undefined);

    await expect(storage().deleteList('list-1')).resolves.toBeUndefined();
  });
});
