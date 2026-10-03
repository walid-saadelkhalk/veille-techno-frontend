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
