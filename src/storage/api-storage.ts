// The production adapter: the API behind the BoardStorage interface.
//
// THE ONLY FILE THAT KNOWS THE ROUTES. A path written anywhere else is a
// defect. This, with memory-storage.ts beside it, is the whole answer to
// "how many files would you touch to swap the data source": the hook that
// uses them cannot tell which one it was handed.
//
// Note there is no "/api" below. The prefix lives in VITE_API_URL, so what
// this file owns is the part that belongs to the business: which route
// serves which operation.

import { toCard, toList, type CardDto, type ListDto } from '../api/dto.ts';
import type { HttpClient } from '../api/http-client.ts';
import type { Board, Card, CardPatch, List } from '../domain/types.ts';
import type { BoardStorage } from './storage.ts';

export function createApiStorage(client: HttpClient): BoardStorage {
  return {
    /**
     * One request for the columns, then one per column for its cards.
     *
     * The N+1 is unavoidable: the API has no global GET /cards, so the shape
     * of the API dictates the cost of the load. What is avoidable is doing
     * them one after the other, hence the Promise.all: the requests leave
     * together and the load costs one round trip instead of N.
     *
     * If a single card request fails, the whole load fails. A partial board
     * would be worse than an error: the user would believe it complete while
     * a column is missing.
     *
     * No sorting here. Reading sorts, see ADR-019: ordering in two places is
     * two places where the order can drift.
     */
    async load(): Promise<Board> {
      const lists = await client.get<ListDto[]>('/lists');
      const cardsPerList = await Promise.all(
        lists.map((list) => client.get<CardDto[]>(`/lists/${list.id}/cards`)),
      );

      return {
        lists: lists.map(toList),
        cards: cardsPerList.flat().map(toCard),
      };
    },

    /** Sends the title alone: the server owns the identifier and the position. */
    async addList(title: string): Promise<List> {
      return toList(await client.post<ListDto>('/lists', { title }));
    },

    /**
     * Sends the title alone. The parent column travels in the URL, never in
     * the body, and the description is left out: the server applies its own
     * default of an empty string. Sending one would duplicate a server rule
     * on the client, where the two could drift apart.
     */
    async addCard(listId: string, title: string): Promise<Card> {
      return toCard(
        await client.post<CardDto>(`/lists/${listId}/cards`, { title }),
      );
    },

    /**
     * The patch travels as it comes. An absent field stays absent in the
     * JSON, which is exactly what lets the title change without touching the
     * description.
     */
    async updateCard(id: string, patch: CardPatch): Promise<Card> {
      return toCard(await client.patch<CardDto>(`/cards/${id}`, patch));
    },

    async deleteCard(id: string): Promise<void> {
      await client.delete(`/cards/${id}`);
    },
  };
}
