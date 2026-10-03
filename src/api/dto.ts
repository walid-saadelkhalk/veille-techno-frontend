// What the API actually sends, and how it becomes a domain object.
//
// Two functions, and they are the only door: every piece of data coming from
// the API passes through here. That is what would make adding runtime
// validation a local change later, see ADR-020.
//
// The conversion names every field it keeps, rather than casting the whole
// object. The difference matters: a cast would carry ownerId, createdAt and
// updatedAt into the domain, and the day the API grows a column that one
// would arrive too. Here nothing arrives that is not written below.
//
// What this does NOT do: check types at run time. If the API sent a number
// where a string is declared, nothing here would notice. See ADR-020 for why
// that is accepted and what it would take to change.

import type { Card, List } from '../domain/types.ts';

/**
 * What POST /api/auth/login answers.
 *
 * No conversion function below: the domain does not know about tokens, so
 * there is nothing to convert it into. auth-api.ts reads the one field.
 */
export type AuthTokenDto = {
  accessToken: string;
};

/** The shape of a list as the API returns it, extra fields included. */
export type ListDto = {
  id: string;
  title: string;
  position: number;
  ownerId: string;
  createdAt: string;
};

/** The shape of a card as the API returns it, extra fields included. */
export type CardDto = {
  id: string;
  title: string;
  description: string;
  position: number;
  listId: string;
  createdAt: string;
  updatedAt: string;
};

/** Keeps the three fields the domain knows about, drops the rest. */
export function toList(dto: ListDto): List {
  return {
    id: dto.id,
    title: dto.title,
    position: dto.position,
  };
}

/** Keeps the five fields the domain knows about, drops the rest. */
export function toCard(dto: CardDto): Card {
  return {
    id: dto.id,
    title: dto.title,
    description: dto.description,
    position: dto.position,
    listId: dto.listId,
  };
}
