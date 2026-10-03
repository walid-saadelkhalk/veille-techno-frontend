// Specification of the in memory adapter.
//
// It is a test double, so the bar is not "does something reasonable" but
// "behaves exactly like the API adapter". A double that answers differently
// from the original lets a test pass on behaviour the real code does not
// have, which is worse than no double at all.

import { beforeEach, describe, expect, it } from 'vitest';

import { ApiError } from '../api/http-client.ts';
import { emptyBoard, type Board } from '../domain/types.ts';
import type { BoardStorage } from './storage.ts';
import { createMemoryStorage } from './memory-storage.ts';

let storage: BoardStorage;

beforeEach(() => {
  storage = createMemoryStorage();
});

describe('point de depart', () => {
  it('part d\'un tableau vide par defaut', async () => {
    await expect(storage.load()).resolves.toEqual(emptyBoard);
  });

  // The injectable form is what makes a hook test readable: it can start on
  // a populated board instead of building one through four awaits.
  it('accepte un Board initial', async () => {
    const initial: Board = {
      lists: [{ id: 'list-1', title: 'A faire', position: 0 }],
      cards: [
        {
          id: 'card-1',
          title: 'Une tache',
          description: '',
          position: 0,
          listId: 'list-1',
        },
      ],
    };

    await expect(createMemoryStorage(initial).load()).resolves.toEqual(initial);
  });

  it('ne partage aucun etat entre deux instances', async () => {
    const other = createMemoryStorage();

    await storage.addList('Seulement ici');

    await expect(other.load()).resolves.toEqual(emptyBoard);
  });
});

describe('addList', () => {
  it('attribue un identifiant, comme le ferait le serveur', async () => {
    const list = await storage.addList('A faire');

    expect(list.id).toBeTruthy();
    expect(list.title).toBe('A faire');
  });

  it('place la colonne en derniere position plus un', async () => {
    const first = await storage.addList('A faire');
    const second = await storage.addList('En cours');

    expect(first.position).toBe(0);
    expect(second.position).toBe(1);
  });

  it('rend la colonne visible au chargement suivant', async () => {
    const list = await storage.addList('A faire');

    const board = await storage.load();

    expect(board.lists).toEqual([list]);
  });

  it('attribue des identifiants distincts', async () => {
    const first = await storage.addList('A faire');
    const second = await storage.addList('En cours');

    expect(first.id).not.toBe(second.id);
  });
});

describe('addCard', () => {
  it('cree la carte avec une description vide, jamais null', async () => {
    const list = await storage.addList('A faire');

    const card = await storage.addCard(list.id, 'Une tache');

    expect(card.description).toBe('');
    expect(card.listId).toBe(list.id);
  });

  // Positions are per column, exactly as the server computes them.
  it('compte les positions par colonne, pas globalement', async () => {
    const left = await storage.addList('A faire');
    const right = await storage.addList('En cours');

    const inLeft = await storage.addCard(left.id, 'Gauche');
    const inRight = await storage.addCard(right.id, 'Droite');
    const secondInLeft = await storage.addCard(left.id, 'Gauche encore');

    expect(inLeft.position).toBe(0);
    expect(inRight.position).toBe(0);
    expect(secondInLeft.position).toBe(1);
  });

  it('echoue sur une colonne inconnue, comme un 404 de l\'API', async () => {
    await expect(
      storage.addCard('colonne-inexistante', 'Une tache'),
    ).rejects.toMatchObject({ kind: 'notFound' });
  });
});

describe('updateCard', () => {
  it('modifie le titre sans toucher a la description', async () => {
    const list = await storage.addList('A faire');
    const card = await storage.addCard(list.id, 'Avant');
    await storage.updateCard(card.id, { description: 'Une description' });

    const updated = await storage.updateCard(card.id, { title: 'Apres' });

    expect(updated.title).toBe('Apres');
    expect(updated.description).toBe('Une description');
  });

  it('modifie la description sans toucher au titre', async () => {
    const list = await storage.addList('A faire');
    const card = await storage.addCard(list.id, 'Le titre');

    const updated = await storage.updateCard(card.id, {
      description: 'Ajoutee',
    });

    expect(updated.title).toBe('Le titre');
    expect(updated.description).toBe('Ajoutee');
  });

  it('echoue sur un identifiant inconnu, comme un 404 de l\'API', async () => {
    await expect(
      storage.updateCard('carte-inexistante', { title: 'x' }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('deleteCard', () => {
  it('retire la carte du tableau', async () => {
    const list = await storage.addList('A faire');
    const card = await storage.addCard(list.id, 'Une tache');

    await storage.deleteCard(card.id);

    await expect(storage.load()).resolves.toMatchObject({ cards: [] });
  });

  // The API answers 404 on an unknown id, so the double must too. The
  // forgiving behaviour lives in the domain, not here.
  it('echoue sur un identifiant inconnu, comme un 404 de l\'API', async () => {
    await expect(
      storage.deleteCard('carte-inexistante'),
    ).rejects.toMatchObject({ kind: 'notFound' });
  });

  it('laisse un trou dans les positions, sans reindexer', async () => {
    const list = await storage.addList('A faire');
    const first = await storage.addCard(list.id, 'Un');
    const middle = await storage.addCard(list.id, 'Deux');
    await storage.addCard(list.id, 'Trois');

    await storage.deleteCard(middle.id);
    const added = await storage.addCard(list.id, 'Quatre');

    const board = await storage.load();
    expect(board.cards.map((card) => card.position)).toEqual([0, 2, 3]);
    expect(added.position).toBe(3);
    expect(first.position).toBe(0);
  });
});

describe('isolation de l\'etat interne', () => {
  // load() must hand out a snapshot. If it returned the live collections,
  // a caller could reach into the store and mutate it, which is exactly
  // what the readonly types forbid everywhere else.
  it('ne rend pas la meme collection a deux chargements', async () => {
    await storage.addList('A faire');

    const first = await storage.load();
    const second = await storage.load();

    expect(first.lists).toEqual(second.lists);
    expect(first.lists).not.toBe(second.lists);
  });
});

// Added at FRONT-37. The double has to cascade exactly as the database does,
// otherwise a hook test would pass on behaviour the real adapter does not
// have. Card.list carries onDelete: Cascade, so deleting a column deletes
// its cards, and the API answers 204 without saying so.
describe('renommer et supprimer une colonne', () => {
  async function populated(): Promise<BoardStorage> {
    const store = createMemoryStorage();
    const first = await store.addList('A faire');
    const second = await store.addList('En cours');
    await store.addCard(first.id, 'Carte de la premiere');
    await store.addCard(second.id, 'Carte de la seconde');

    return store;
  }

  it('updateList remplace le titre et rend la colonne a jour', async () => {
    const store = await populated();
    const { lists } = await store.load();

    const updated = await store.updateList(lists[0]!.id, {
      title: 'Titre corrige',
    });

    expect(updated.title).toBe('Titre corrige');
    expect((await store.load()).lists[0]?.title).toBe('Titre corrige');
  });

  it('updateList garde la position et l\'identifiant', async () => {
    const store = await populated();
    const { lists } = await store.load();

    const updated = await store.updateList(lists[0]!.id, { title: 'Autre' });

    expect(updated.id).toBe(lists[0]!.id);
    expect(updated.position).toBe(lists[0]!.position);
  });

  it('updateList leve notFound sur une colonne inconnue, comme un 404', async () => {
    const store = await populated();

    await expect(
      store.updateList('colonne-inconnue', { title: 'x' }),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('deleteList retire la colonne ET ses cartes, comme la cascade', async () => {
    const store = await populated();
    const { lists } = await store.load();

    await store.deleteList(lists[0]!.id);

    const after = await store.load();
    expect(after.lists).toHaveLength(1);
    expect(after.cards).toHaveLength(1);
    expect(after.cards[0]?.listId).toBe(lists[1]!.id);
  });

  it('deleteList leve notFound sur une colonne inconnue', async () => {
    const store = await populated();

    await expect(store.deleteList('colonne-inconnue')).rejects.toBeInstanceOf(
      ApiError,
    );
  });
});

// Added at FRONT-38. The server places a moved card at the end of its new
// column, so the double must too. A double that left the position alone
// would let a display test pass on an order the real adapter never produces.
describe('deplacer une carte entre colonnes', () => {
  it('change la colonne de la carte', async () => {
    const store = createMemoryStorage();
    const from = await store.addList('A faire');
    const to = await store.addList('En cours');
    const card = await store.addCard(from.id, 'Une tache');

    const moved = await store.updateCard(card.id, { listId: to.id });

    expect(moved.listId).toBe(to.id);
  });

  it('la place en FIN de colonne d\'arrivee', async () => {
    const store = createMemoryStorage();
    const from = await store.addList('A faire');
    const to = await store.addList('En cours');
    await store.addCard(to.id, 'Deja la');
    const card = await store.addCard(from.id, 'Celle qui bouge');

    const moved = await store.updateCard(card.id, { listId: to.id });

    const { cards } = await store.load();
    const inTarget = cards.filter((entry) => entry.listId === to.id);
    expect(Math.max(...inTarget.map((entry) => entry.position))).toBe(
      moved.position,
    );
  });

  it('garde le titre et la description pendant le deplacement', async () => {
    const store = createMemoryStorage();
    const from = await store.addList('A faire');
    const to = await store.addList('En cours');
    const card = await store.addCard(from.id, 'Une tache');
    await store.updateCard(card.id, { description: 'Un texte' });

    const moved = await store.updateCard(card.id, { listId: to.id });

    expect(moved.title).toBe('Une tache');
    expect(moved.description).toBe('Un texte');
  });

  it('leve notFound quand la colonne cible n\'existe pas', async () => {
    const store = createMemoryStorage();
    const from = await store.addList('A faire');
    const card = await store.addCard(from.id, 'Une tache');

    await expect(
      store.updateCard(card.id, { listId: 'colonne-inconnue' }),
    ).rejects.toBeInstanceOf(ApiError);
  });
});
