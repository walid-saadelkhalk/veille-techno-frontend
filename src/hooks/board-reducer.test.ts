// Specification of the state machine, written before it exists.
//
// NO DOM AND NO REACT HERE, and that is the point of the reducer living in
// its own file: a state plus an action gives a state, so the transitions can
// be stated exhaustively as a table of inputs and outputs. Mounting a
// component to check that a failed action keeps the board intact would hide
// what is being verified behind three layers of machinery.

import { describe, expect, it } from 'vitest';

import type { Card, List } from '../domain/types.ts';
import {
  boardReducer,
  initialBoardState,
  type BoardState,
} from './board-reducer.ts';

const list: List = { id: 'list-1', title: 'A faire', position: 0 };

const card: Card = {
  id: 'card-1',
  title: 'Ecrire les tests',
  description: '',
  position: 0,
  listId: 'list-1',
};

/**
 * A board already loaded, which is the starting point of every action.
 *
 * A FUNCTION and not a constant, deliberately. Computed at module scope, it
 * would call the subject under test during the import, so a single throw
 * would collapse the whole file and report "no tests" instead of ten precise
 * failures. A fixture must not be able to take the suite down with it.
 */
function readyState(): BoardState {
  return boardReducer(initialBoardState, {
    type: 'loadSucceeded',
    board: { lists: [list], cards: [card] },
  });
}

describe("l'etat initial", () => {
  it('est en chargement, et non en tableau vide', () => {
    // THE DISTINCTION THIS WHOLE SHAPE EXISTS FOR: a loading board and an
    // empty board are two different things. Showing "aucune colonne" while
    // the request is still running is an interface bug, not a detail.
    expect(initialBoardState.status).toBe('loading');
    expect(initialBoardState.error).toBeNull();
    expect(initialBoardState.pending).toBe(false);
  });
});

describe('le chargement', () => {
  it('passe a ready et pose le tableau recu', () => {
    const ready = readyState();

    expect(ready.status).toBe('ready');
    expect(ready.board.lists).toHaveLength(1);
    expect(ready.board.cards).toHaveLength(1);
  });

  it('passe a error avec un message lisible', () => {
    const failed = boardReducer(initialBoardState, {
      type: 'loadFailed',
      message: 'Le serveur est injoignable.',
    });

    expect(failed.status).toBe('error');
    expect(failed.error).toBe('Le serveur est injoignable.');
  });

  it('revient en chargement et efface l\'erreur quand on reessaie', () => {
    const failed = boardReducer(initialBoardState, {
      type: 'loadFailed',
      message: 'Le serveur est injoignable.',
    });

    const retried = boardReducer(failed, { type: 'loadStarted' });

    expect(retried.status).toBe('loading');
    expect(retried.error).toBeNull();
  });
});

describe('une action en cours', () => {
  it('marque pending et efface le message precedent', () => {
    // Clearing here rather than on success: a stale message left on screen
    // while a new action runs tells the user something false.
    const withMessage = boardReducer(readyState(), {
      type: 'actionFailed',
      message: 'Cette ressource ne vous appartient pas.',
    });

    const started = boardReducer(withMessage, { type: 'actionStarted' });

    expect(started.pending).toBe(true);
    expect(started.error).toBeNull();
  });
});

describe('les mutations, qui passent par les operations pures du domaine', () => {
  it('insere la colonne rendue par le serveur', () => {
    const other: List = { id: 'list-2', title: 'En cours', position: 1 };

    const next = boardReducer(readyState(), { type: 'listAdded', list: other });

    expect(next.board.lists).toHaveLength(2);
    expect(next.pending).toBe(false);
    expect(next.status).toBe('ready');
  });

  it('insere une carte absente', () => {
    const other: Card = { ...card, id: 'card-2', title: 'Relire' };

    const next = boardReducer(readyState(), { type: 'cardSaved', card: other });

    expect(next.board.cards).toHaveLength(2);
  });

  it('remplace une carte deja presente, sans en ajouter une', () => {
    // Same action for an addition and a modification, because withCard is an
    // upsert. That is ADR-019 of lot 1 paying off at lot 4: one action type
    // instead of two, and the reducer has no idea which case it is in.
    const renamed: Card = { ...card, title: 'Titre corrige' };

    const next = boardReducer(readyState(), { type: 'cardSaved', card: renamed });

    expect(next.board.cards).toHaveLength(1);
    expect(next.board.cards[0]?.title).toBe('Titre corrige');
  });

  it('retire la carte supprimee', () => {
    const next = boardReducer(readyState(), {
      type: 'cardDeleted',
      cardId: 'card-1',
    });

    expect(next.board.cards).toHaveLength(0);
  });
});

describe('une action qui echoue', () => {
  it('laisse le tableau STRICTEMENT intact et informe', () => {
    // Compared by reference, not by content: the board must be the very same
    // object, which proves nothing was rebuilt, reordered or half applied.
    const ready = readyState();
    const started = boardReducer(ready, { type: 'actionStarted' });

    const failed = boardReducer(started, {
      type: 'actionFailed',
      message: 'Cette ressource ne vous appartient pas.',
    });

    expect(failed.board).toBe(ready.board);
    expect(failed.error).toBe('Cette ressource ne vous appartient pas.');
    expect(failed.pending).toBe(false);
    expect(failed.status).toBe('ready');
  });
});
