// The single door to persistence. Everything the application does to the
// board goes through this interface, and nothing else knows where the data
// lives.
//
// One method per business operation, not load plus save. No route of the API
// stores a whole board, so a save(board) would force the adapter to diff the
// old board against the new one to deduce the HTTP calls. It would also make
// the answer to "how many files would you touch to swap the data source"
// false, since every caller would have to change.
//
// Nothing here mentions a URL, an HTTP status or a network. That constraint
// is what lets an in memory object implement it, which is what makes the
// claim demonstrable rather than merely stated.

import type { Board, Card, CardPatch, List } from '../domain/types.ts';

export interface BoardStorage {
  /** The whole board, as the data source currently holds it. */
  load(): Promise<Board>;

  /** Returns the created column, identifier and position included. */
  addList(title: string): Promise<List>;

  /** Returns the created card, with an empty description. */
  addCard(listId: string, title: string): Promise<Card>;

  /** Returns the card as it stands after the change. */
  updateCard(id: string, patch: CardPatch): Promise<Card>;

  deleteCard(id: string): Promise<void>;
}
