// Specification of the pure board operations. Written before the
// implementation and watched failing first: a test that never failed does not
// prove that it tests anything.
//
// The recurring assertion of this file is immutability. Every transformation
// is checked twice: the returned board is a new object, and the input board is
// byte for byte what it was. That is the claim the whole project rests on,
// see ADR-008 and section 16 of CLAUDE.md.

import { describe, expect, it } from 'vitest';

import {
  cardsOfList,
  isBlankTitle,
  sortedLists,
  withCard,
  withList,
  withoutCard,
  withoutList,
} from './operations.ts';
import { emptyBoard, type Board, type Card, type List } from './types.ts';

const todo: List = { id: 'list-1', title: 'A faire', position: 0 };
const doing: List = { id: 'list-2', title: 'En cours', position: 1 };

// Positions are deliberately sparse. Gaps are expected after a deletion and
// nothing reindexes, see ADR-011.
function makeCard(
  id: string,
  listId: string,
  position: number,
  title = 'Une tache',
): Card {
  return { id, title, description: '', position, listId };
}

function makeBoard(lists: readonly List[], cards: readonly Card[]): Board {
  return { lists, cards };
}

/** Asserts that the call left its input untouched, structurally. */
function expectUntouched(board: Board, run: () => unknown): void {
  const before = structuredClone(board);
  run();
  expect(board).toEqual(before);
}

describe('withList', () => {
  it('ajoute une colonne absente du tableau', () => {
    const result = withList(emptyBoard, todo);

    expect(result.lists).toEqual([todo]);
  });

  it('remplace la colonne portant le meme identifiant', () => {
    const board = makeBoard([todo, doing], []);
    const renamed: List = { ...todo, title: 'Backlog' };

    const result = withList(board, renamed);

    expect(result.lists).toHaveLength(2);
    expect(result.lists).toContainEqual(renamed);
    expect(result.lists).not.toContainEqual(todo);
  });

  it('rend un nouvel objet et ne modifie pas le tableau d\'origine', () => {
    const board = makeBoard([todo], []);

    const result = withList(board, doing);

    expect(result).not.toBe(board);
    expect(board.lists).toEqual([todo]);
  });

  it('laisse les cartes intactes', () => {
    const card = makeCard('card-1', todo.id, 0);
    const board = makeBoard([todo], [card]);

    const result = withList(board, doing);

    expect(result.cards).toEqual([card]);
  });
});

describe('withCard', () => {
  it('ajoute une carte absente du tableau', () => {
    const board = makeBoard([todo], []);
    const card = makeCard('card-1', todo.id, 0);

    const result = withCard(board, card);

    expect(result.cards).toEqual([card]);
  });

  // The decision of ADR-019: adding and updating are the same domain
  // operation, because the server owns the identifier.
  it('remplace la carte portant le meme identifiant', () => {
    const card = makeCard('card-1', todo.id, 0, 'Avant');
    const board = makeBoard([todo], [card]);
    const edited: Card = { ...card, title: 'Apres', description: 'Ajoutee' };

    const result = withCard(board, edited);

    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]).toEqual(edited);
  });

  it('ne touche pas aux autres cartes lors d\'un remplacement', () => {
    const first = makeCard('card-1', todo.id, 0);
    const second = makeCard('card-2', todo.id, 1);
    const board = makeBoard([todo], [first, second]);

    const result = withCard(board, { ...first, title: 'Modifiee' });

    expect(result.cards).toContainEqual(second);
  });

  // Decision 3 of ADR-019: the domain does not police referential integrity,
  // the server does. cardsOfList simply will not show it.
  it('insere une carte dont le listId ne correspond a aucune colonne', () => {
    const board = makeBoard([todo], []);
    const orphan = makeCard('card-1', 'colonne-inexistante', 0);

    const result = withCard(board, orphan);

    expect(result.cards).toEqual([orphan]);
  });

  it('rend un nouvel objet et ne modifie pas le tableau d\'origine', () => {
    const board = makeBoard([todo], [makeCard('card-1', todo.id, 0)]);

    expectUntouched(board, () => withCard(board, makeCard('card-2', todo.id, 1)));
    expect(withCard(board, makeCard('card-2', todo.id, 1))).not.toBe(board);
  });
});

describe('withoutCard', () => {
  const first = makeCard('card-1', todo.id, 0);
  const middle = makeCard('card-2', todo.id, 1);
  const last = makeCard('card-3', todo.id, 2);

  // The triplet that catches React key bugs, see section 16 of CLAUDE.md.
  it('retire la premiere carte sans toucher aux autres', () => {
    const board = makeBoard([todo], [first, middle, last]);

    const result = withoutCard(board, first.id);

    expect(result.cards).toEqual([middle, last]);
  });

  it('retire la derniere carte sans toucher aux autres', () => {
    const board = makeBoard([todo], [first, middle, last]);

    const result = withoutCard(board, last.id);

    expect(result.cards).toEqual([first, middle]);
  });

  it('retire la seule carte et laisse une collection vide', () => {
    const board = makeBoard([todo], [first]);

    const result = withoutCard(board, first.id);

    expect(result.cards).toEqual([]);
  });

  it('laisse un trou dans les positions, sans reindexer', () => {
    const board = makeBoard([todo], [first, middle, last]);

    const result = withoutCard(board, middle.id);

    expect(result.cards.map((card) => card.position)).toEqual([0, 2]);
  });

  // Decision 1 of ADR-019: the hook gets here after a 204, the deletion
  // succeeded. Raising would turn a successful deletion into a displayed error.
  it('ne fait rien sur un identifiant inconnu', () => {
    const board = makeBoard([todo], [first]);

    const result = withoutCard(board, 'identifiant-inconnu');

    expect(result.cards).toEqual([first]);
  });

  it('laisse les colonnes intactes', () => {
    const board = makeBoard([todo, doing], [first]);

    const result = withoutCard(board, first.id);

    expect(result.lists).toEqual([todo, doing]);
  });

  it('rend un nouvel objet et ne modifie pas le tableau d\'origine', () => {
    const board = makeBoard([todo], [first, middle]);

    expectUntouched(board, () => withoutCard(board, first.id));
    expect(withoutCard(board, first.id)).not.toBe(board);
  });
});

describe('sortedLists', () => {
  it('trie les colonnes par position croissante', () => {
    const board = makeBoard([doing, todo], []);

    expect(sortedLists(board).map((list) => list.id)).toEqual([
      'list-1',
      'list-2',
    ]);
  });

  it('rend un tableau vide quand il n\'y a aucune colonne', () => {
    expect(sortedLists(emptyBoard)).toEqual([]);
  });

  // The sort() trap. sort() mutates its receiver and returns it, so a sort
  // written without copying would silently reorder the state while displaying
  // a correct result. readonly forbids it at compile time, this test proves it
  // at run time.
  it('ne reordonne pas la collection d\'origine', () => {
    const board = makeBoard([doing, todo], []);

    sortedLists(board);

    expect(board.lists.map((list) => list.id)).toEqual(['list-2', 'list-1']);
  });
});

describe('cardsOfList', () => {
  const inTodo = makeCard('card-1', todo.id, 2);
  const alsoInTodo = makeCard('card-2', todo.id, 0);
  const inDoing = makeCard('card-3', doing.id, 0);

  it('ne rend que les cartes de la colonne demandee', () => {
    const board = makeBoard([todo, doing], [inTodo, alsoInTodo, inDoing]);

    expect(cardsOfList(board, doing.id)).toEqual([inDoing]);
  });

  it('trie les cartes par position croissante', () => {
    const board = makeBoard([todo], [inTodo, alsoInTodo]);

    expect(cardsOfList(board, todo.id).map((card) => card.id)).toEqual([
      'card-2',
      'card-1',
    ]);
  });

  it('rend un tableau vide pour une colonne sans carte', () => {
    const board = makeBoard([todo, doing], [inTodo]);

    expect(cardsOfList(board, doing.id)).toEqual([]);
  });

  it('rend un tableau vide pour une colonne inconnue', () => {
    const board = makeBoard([todo], [inTodo]);

    expect(cardsOfList(board, 'colonne-inexistante')).toEqual([]);
  });

  it('ne reordonne pas la collection d\'origine', () => {
    const board = makeBoard([todo], [inTodo, alsoInTodo]);

    cardsOfList(board, todo.id);

    expect(board.cards.map((card) => card.id)).toEqual(['card-1', 'card-2']);
  });
});

describe('isBlankTitle', () => {
  it('accepte un titre ordinaire', () => {
    expect(isBlankTitle('Ecrire les tests')).toBe(false);
  });

  it('accepte un titre entoure d\'espaces, puisqu\'il a du contenu', () => {
    expect(isBlankTitle('  Ecrire les tests  ')).toBe(false);
  });

  it('refuse une chaine vide', () => {
    expect(isBlankTitle('')).toBe(true);
  });

  it('refuse une chaine faite uniquement d\'espaces', () => {
    expect(isBlankTitle('   ')).toBe(true);
  });

  it('refuse tabulations et sauts de ligne', () => {
    expect(isBlankTitle('\t\n ')).toBe(true);
  });
});

// Added at FRONT-37. Deleting a column deletes its cards, and that rule is
// enforced BY THE DATABASE: Card.list carries onDelete: Cascade. The server
// answers 204 without saying what it took with it, so the client has to
// mirror the cascade or it would keep orphan cards in memory.
//
// This is the ONLY place in the project where a database rule is reproduced
// on the client. It is not duplicated business logic, it is the consequence
// of a deletion whose answer carries no body.
describe('withoutList', () => {
  const populated = makeBoard(
    [todo, doing],
    [
      makeCard('card-1', 'list-1', 0),
      makeCard('card-2', 'list-2', 1),
      makeCard('card-3', 'list-1', 2),
    ],
  );

  it('retire la colonne', () => {
    const next = withoutList(populated, 'list-1');

    expect(next.lists.map((entry) => entry.id)).toEqual(['list-2']);
  });

  it('retire AUSSI toutes les cartes de cette colonne', () => {
    const next = withoutList(populated, 'list-1');

    expect(next.cards.map((entry) => entry.id)).toEqual(['card-2']);
  });

  it('ne touche pas aux cartes des autres colonnes', () => {
    const next = withoutList(populated, 'list-2');

    expect(next.cards.map((entry) => entry.id)).toEqual(['card-1', 'card-3']);
  });

  it('ne fait rien sur un identifiant inconnu, et ne leve pas', () => {
    // Same tolerance as withoutCard: the caller gets here after a 204, so
    // the deletion succeeded. Raising would turn a success into an error.
    const next = withoutList(populated, 'colonne-inconnue');

    expect(next.lists).toHaveLength(2);
    expect(next.cards).toHaveLength(3);
  });

  it("laisse le tableau d'origine intact", () => {
    withoutList(populated, 'list-1');

    expect(populated.lists).toHaveLength(2);
    expect(populated.cards).toHaveLength(3);
  });
});
