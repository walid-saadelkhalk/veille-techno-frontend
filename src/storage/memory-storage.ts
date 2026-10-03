// The second implementation of BoardStorage, entirely in RAM.
//
// Two reasons it exists, and the first would be enough on its own.
//
// It lets use-board.ts be tested with no network, no server and no database.
// That argument is far stronger with an API than it was with a local store:
// without this file, testing the hook would mean starting PostgreSQL.
//
// And it makes the answer to "how many files would you touch to swap the
// data source" something to show rather than something to claim. Open this
// file next to api-storage.ts: same interface, one talks to the network and
// the other does not, and the hook cannot tell which one it was handed.
//
// IT IS A TEST DOUBLE, NOT A FEATURE. The bar is therefore not "behaves
// reasonably" but "behaves exactly like the API adapter". A double that
// answers differently lets a test pass on behaviour the real code does not
// have, which is worse than having no double. That is why an unknown
// identifier raises the same notFound here as a 404 does there.

import { ApiError } from '../api/http-client.ts';
import { emptyBoard, type Board, type Card, type CardPatch, type List } from '../domain/types.ts';
import type { BoardStorage } from './storage.ts';

/**
 * Identifiers are a plain counter, not random ones.
 *
 * This is a double: its identifiers never leave the test run, so global
 * uniqueness buys nothing. Predictable ones buy a lot, because a hook test
 * can then assert on 'card-1' instead of capturing a value first.
 */
function createCounter(prefix: string): () => string {
  let next = 1;

  return () => `${prefix}-${next++}`;
}

/** Last position plus one, the same rule the server applies. */
function nextPosition(positions: readonly number[]): number {
  return positions.length === 0 ? 0 : Math.max(...positions) + 1;
}

export function createMemoryStorage(initial: Board = emptyBoard): BoardStorage {
  // Copied, never aliased: a caller holding the initial board must not be
  // able to reach into the store through it.
  let lists: List[] = [...initial.lists];
  let cards: Card[] = [...initial.cards];

  const nextListId = createCounter('list');
  const nextCardId = createCounter('card');

  function cardAt(id: string): number {
    const index = cards.findIndex((card) => card.id === id);

    if (index === -1) {
      throw new ApiError('notFound', ['Carte introuvable.']);
    }

    return index;
  }

  return {
    // Every method is async, like the API adapter's. It is not cosmetic:
    // a synchronous throw from a function that returns a promise is a
    // different failure mode from a rejected promise, and a double that
    // fails differently from the original is not a double.
    async load(): Promise<Board> {
      // Fresh arrays on every call. Returning the live ones would let a
      // caller mutate the store from the outside, which is precisely what
      // the readonly types forbid everywhere else in the project.
      return { lists: [...lists], cards: [...cards] };
    },

    async addList(title: string): Promise<List> {
      const list: List = {
        id: nextListId(),
        title,
        position: nextPosition(lists.map((entry) => entry.position)),
      };

      lists = [...lists, list];

      return list;
    },

    async addCard(listId: string, title: string): Promise<Card> {
      if (!lists.some((list) => list.id === listId)) {
        throw new ApiError('notFound', ['Colonne introuvable.']);
      }

      const card: Card = {
        id: nextCardId(),
        title,
        // Never null, the same default the server applies.
        description: '',
        position: nextPosition(
          cards
            .filter((entry) => entry.listId === listId)
            .map((entry) => entry.position),
        ),
        listId,
      };

      cards = [...cards, card];

      return card;
    },

    async updateCard(id: string, patch: CardPatch): Promise<Card> {
      const index = cardAt(id);
      const current = cards[index] as Card;

      // An absent field leaves the current value alone, which is what lets
      // the title change without clearing the description.
      const updated: Card = {
        ...current,
        title: patch.title ?? current.title,
        description: patch.description ?? current.description,
      };

      cards = cards.map((card, position) =>
        position === index ? updated : card,
      );

      return updated;
    },

    async deleteCard(id: string): Promise<void> {
      cardAt(id);
      cards = cards.filter((card) => card.id !== id);
    },
  };
}
