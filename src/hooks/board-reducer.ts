// The board's state machine, and the only place that knows how the state
// evolves.
//
// IT IS PURE, and that is why it lives in its own file: a state plus an
// action gives a state, with no React, no DOM and no promise, so its
// transitions are tested in Node as a table of inputs and outputs. Pure is
// also what React REQUIRES of a reducer, which is why calling the domain
// operations from here is legitimate: they are pure too.
//
// WHY FOUR FIELDS AND NOT A DISCRIMINATED UNION. The tempting shape is
// { status: 'ready', board } | { status: 'error', message }, which is safer
// in TypeScript. It does not survive one criterion: a FAILED ACTION must
// leave the board on screen and add a message. In that union, showing an
// error means leaving the ready state, so a 403 on a delete would take the
// whole board off the screen. There are two different failures here:
//
//   the LOAD failed    -> nothing to show   -> status 'error', an error screen
//   an ACTION failed   -> board still there -> status 'ready' PLUS a message
//
// And this shape kills an interface bug by construction: 'loading' and
// 'ready with an empty board' are two distinct values, so nothing can say
// "aucune colonne" while the request is still running.

import {
  withCard,
  withList,
  withoutCard,
  withoutList,
} from '../domain/operations.ts';
import { emptyBoard } from '../domain/types.ts';
import type { Board, Card, List } from '../domain/types.ts';

export type BoardStatus = 'loading' | 'ready' | 'error';

export type BoardState = {
  /** The fate of the LOAD, not of the last action. */
  readonly status: BoardStatus;
  readonly board: Board;
  /** An action is in flight, so another one must not start. */
  readonly pending: boolean;
  readonly error: string | null;
};

export type BoardAction =
  | { type: 'loadStarted' }
  | { type: 'loadSucceeded'; board: Board }
  | { type: 'loadFailed'; message: string }
  | { type: 'actionStarted' }
  | { type: 'actionFailed'; message: string }
  // The three mutations carry the entity THE SERVER returned, never one the
  // client made up: identifiers and positions belong to the server, ADR-011.
  | { type: 'listSaved'; list: List }
  | { type: 'listDeleted'; listId: string }
  | { type: 'cardSaved'; card: Card }
  | { type: 'cardDeleted'; cardId: string };

export const initialBoardState: BoardState = {
  status: 'loading',
  board: emptyBoard,
  pending: false,
  error: null,
};

/** An action that succeeded: the board moves on, nothing is pending, no message. */
function settled(state: BoardState, board: Board): BoardState {
  return { ...state, board, pending: false, error: null };
}

export function boardReducer(
  state: BoardState,
  action: BoardAction,
): BoardState {
  switch (action.type) {
    case 'loadStarted':
      // Clears the message, so a retry does not start under the previous
      // failure's text.
      return { ...state, status: 'loading', error: null };

    case 'loadSucceeded':
      return { status: 'ready', board: action.board, pending: false, error: null };

    case 'loadFailed':
      return { ...state, status: 'error', pending: false, error: action.message };

    case 'actionStarted':
      // The message is cleared HERE rather than on success: a stale message
      // left on screen while a new action runs tells the user something
      // false about what is happening now.
      return { ...state, pending: true, error: null };

    case 'actionFailed':
      // The board is not even mentioned, so it stays the VERY SAME object.
      // A test compares it by reference, which is what proves nothing was
      // rebuilt, reordered or half applied.
      return { ...state, pending: false, error: action.message };

    case 'listSaved':
      return settled(state, withList(state.board, action.list));

    // One case for an addition AND a modification, because withCard is an
    // upsert (ADR-019). The reducer has no idea which of the two it is
    // doing, and it does not need to.
    case 'cardSaved':
      return settled(state, withCard(state.board, action.card));

    case 'cardDeleted':
      return settled(state, withoutCard(state.board, action.cardId));

    // Removes the column AND its cards, mirroring the database cascade.
    case 'listDeleted':
      return settled(state, withoutList(state.board, action.listId));
  }
}
