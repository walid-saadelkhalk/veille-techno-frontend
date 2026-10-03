// Pure operations on the board. This file, like every file in src/domain,
// never imports React, never calls fetch and knows no URL.
//
// Every transformation returns a NEW board and leaves its input untouched.
// That is not politeness: React decides to re render by comparing references,
// so a mutated board would update the data and never update the screen.
// See ADR-008 and section 16 of CLAUDE.md.
//
// Since ADR-011 the server owns identifiers and positions, so these functions
// never create an entity. They insert, replace or remove the one the server
// returned. See ADR-019 for why inserting and replacing are a single function.

import type { Board, Card, List } from './types.ts';

/**
 * Replaces the entry carrying the same id, or appends it when absent.
 *
 * Shared by withList and withCard, because both answer the same question:
 * the server handed us this entity, make the collection reflect it.
 *
 * The constraint on T is what makes the sharing safe: any entity with a
 * readonly string id works, and nothing else compiles.
 */
function upsertById<T extends { readonly id: string }>(
  items: readonly T[],
  item: T,
): readonly T[] {
  const isKnown = items.some((candidate) => candidate.id === item.id);

  if (!isKnown) {
    return [...items, item];
  }

  return items.map((candidate) =>
    candidate.id === item.id ? item : candidate,
  );
}

/** Adds the column, or replaces the one carrying the same id. */
export function withList(board: Board, list: List): Board {
  return { ...board, lists: upsertById(board.lists, list) };
}

/**
 * Adds the card, or replaces the one carrying the same id.
 *
 * A card whose listId matches no column is inserted anyway: the domain does
 * not police referential integrity, the server does and answers 404.
 * cardsOfList simply will not show it. See ADR-019, decision 3.
 */
export function withCard(board: Board, card: Card): Board {
  return { ...board, cards: upsertById(board.cards, card) };
}

/**
 * Removes the card, and does nothing when the id is unknown.
 *
 * Not raising is deliberate: the caller gets here after a 204, the deletion
 * succeeded. Raising would turn a successful deletion into a displayed error.
 * See ADR-019, decision 1.
 */
export function withoutCard(board: Board, cardId: string): Board {
  return {
    ...board,
    cards: board.cards.filter((card) => card.id !== cardId),
  };
}

/**
 * Sorts a COPY by ascending position.
 *
 * The copy is the entire point. sort() mutates its receiver and returns it,
 * so sorting in place would silently reorder the application state while
 * displaying a perfectly correct result, and no rendering test would notice.
 * readonly forbids it at compile time, the spread states the intent.
 *
 * The comparator is mandatory: the default sort() compares string forms, so
 * position 10 would land before position 2.
 */
function byPosition<T extends { readonly position: number }>(
  items: readonly T[],
): readonly T[] {
  return [...items].sort((first, second) => first.position - second.position);
}

/** The columns in display order. */
export function sortedLists(board: Board): readonly List[] {
  return byPosition(board.lists);
}

/**
 * The cards of one column, in display order.
 *
 * This is the cost assumed by the flat shape of ADR-007: the display filters
 * instead of reading list.cards. In exchange the calculation stays here, in a
 * tested pure function, rather than inside a component.
 *
 * An unknown listId yields an empty array, which is the honest answer: the
 * domain does not know whether that column exists, and it is not its job.
 */
export function cardsOfList(board: Board, listId: string): readonly Card[] {
  return byPosition(board.cards.filter((card) => card.listId === listId));
}

/**
 * True when a title holds nothing but whitespace.
 *
 * Lives here so that the rule stays out of the components, and so that the
 * interface can refuse an empty title without a round trip. The server applies
 * the same rule with @Matches(/\S/), and this is a convenience, never the
 * guarantee: the server remains the one that decides.
 */
export function isBlankTitle(title: string): boolean {
  return title.trim().length === 0;
}

/**
 * Removes the column AND every card it held.
 *
 * THE ONLY PLACE IN THE PROJECT WHERE A DATABASE RULE IS MIRRORED ON THE
 * CLIENT. Card.list carries onDelete: Cascade, so deleting a column deletes
 * its cards, and DELETE /lists/:id answers 204 without saying what it took
 * with it. Removing only the column would leave orphan cards in the state.
 *
 * It is not duplicated business logic: it is the consequence of a deletion
 * whose answer carries no body. Composing withoutCard in a loop would have
 * worked and read worse.
 *
 * An unknown id changes nothing and does not raise, like withoutCard: the
 * caller gets here after a 204, so the deletion succeeded.
 */
export function withoutList(board: Board, listId: string): Board {
  return {
    lists: board.lists.filter((list) => list.id !== listId),
    cards: board.cards.filter((card) => card.listId !== listId),
  };
}
