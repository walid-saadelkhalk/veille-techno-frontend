// The one place where React state meets the domain.
//
// It knows NOTHING about where the data lives: it is handed a BoardStorage
// and cannot tell an API from a Map. Its own tests prove it, since they all
// hand it the in memory adapter. No fetch and no URL appear below, and that
// is checkable rather than claimed.
//
// THE SAVE LIVES IN THE ACTION, NEVER IN AN EFFECT. An effect triggered by a
// state change has no idea what to do with a 403: it does not know which
// action failed, it has no user context, and it cannot undo anything.
// useEffect is the right tool for the INITIAL LOAD, and for that only.
//
// AND THERE IS NO OPTIMISTIC UPDATE, by ADR-011: the client cannot guess the
// identifier the server will assign, so it cannot show a card before
// receiving it. Real limit, to be cited rather than hidden: on a slow
// network every action would be seen waiting.

import { useCallback, useEffect, useReducer, useState } from 'react';

import { messageOf } from '../api/error-message.ts';
import { isBlankTitle } from '../domain/operations.ts';
import type { Board, CardPatch } from '../domain/types.ts';
import type { BoardStorage } from '../storage/storage.ts';
import {
  boardReducer,
  initialBoardState,
  type BoardAction,
  type BoardStatus,
} from './board-reducer.ts';

export interface BoardView {
  status: BoardStatus;
  board: Board;
  pending: boolean;
  error: string | null;
  reload(): void;
  // Each one reports whether the object was REALLY created or changed, so a
  // form can clear its field on success and keep what was typed on failure.
  // A local refusal answers false too: nothing was created either way.
  addList(title: string): Promise<boolean>;
  addCard(listId: string, title: string): Promise<boolean>;
  updateCard(id: string, patch: CardPatch): Promise<boolean>;
  deleteCard(id: string): Promise<boolean>;
}

export function useBoard(storage: BoardStorage): BoardView {
  const [state, dispatch] = useReducer(boardReducer, initialBoardState);
  // A counter rather than a boolean: asking to reload twice must trigger two
  // loads, and a boolean flipped back to the same value would not.
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    // THE ABANDON FLAG, which is the cleanup this effect returns. It does not
    // cancel the request, it stops its answer from being used. That covers
    // the only two observable symptoms: a state update after unmount, and a
    // late answer overwriting a fresher one.
    //
    // AbortController was weighed and left out, see ADR-025. It would cancel
    // the request for real, at the price of threading an AbortSignal through
    // BoardStorage and, above all, of a NEW failure mode: an aborted fetch
    // rejects with an AbortError, which our client would report as "le
    // serveur est injoignable", a message about something we did ourselves.
    //
    // IN DEVELOPMENT YOU WILL SEE TWO REQUESTS in the network tab. Strict
    // mode mounts, unmounts and remounts, which is how it checks that this
    // cleanup exists. The first answer is ignored. Not a bug.
    let abandoned = false;

    dispatch({ type: 'loadStarted' });

    storage.load().then(
      (board) => {
        if (!abandoned) {
          dispatch({ type: 'loadSucceeded', board });
        }
      },
      (caught: unknown) => {
        if (!abandoned) {
          dispatch({ type: 'loadFailed', message: messageOf(caught) });
        }
      },
    );

    return () => {
      abandoned = true;
    };
    // THE STORAGE MUST BE A STABLE REFERENCE. It is a dependency of this
    // effect, so handing over a freshly built adapter on every render would
    // reload, dispatch, render, reload again: an infinite loop that aborts
    // the process rather than warning. The composition root builds it once,
    // which is exactly why services.ts is a function called once and not a
    // factory called where it is used.
  }, [storage, reloads]);

  /**
   * The shared skeleton of every action: refuse if one is running, mark it,
   * await the server, then dispatch what the operation decided.
   *
   * The operation returns the ACTION rather than the entity, which is what
   * keeps the four public methods down to one line each while leaving this
   * function unaware of what they do.
   */
  const run = useCallback(
    async (operate: () => Promise<BoardAction>): Promise<boolean> => {
      // With a network round trip, a double click is easy to trigger, where
      // it was invisible with a local storage. Limit to name: two clicks in
      // the SAME event tick would both read pending as false. A real user
      // cannot, since two events mean two renders, and lot 5 disables the
      // buttons anyway.
      if (state.pending) {
        return false;
      }

      dispatch({ type: 'actionStarted' });

      try {
        dispatch(await operate());

        return true;
      } catch (caught) {
        dispatch({ type: 'actionFailed', message: messageOf(caught) });

        return false;
      }
    },
    [state.pending],
  );

  const addList = useCallback(
    async (title: string): Promise<boolean> => {
      // Not a duplicate of a server rule, see ADR-017: a blank title has no
      // chance of being accepted, so the round trip is not worth making.
      // isBlankTitle comes from src/domain, written at lot 1.
      if (isBlankTitle(title)) {
        return false;
      }

      return run(async () => ({
        type: 'listAdded',
        list: await storage.addList(title.trim()),
      }));
    },
    [run, storage],
  );

  const addCard = useCallback(
    async (listId: string, title: string): Promise<boolean> => {
      if (isBlankTitle(title)) {
        return false;
      }

      return run(async () => ({
        type: 'cardSaved',
        card: await storage.addCard(listId, title.trim()),
      }));
    },
    [run, storage],
  );

  const updateCard = useCallback(
    async (id: string, patch: CardPatch): Promise<boolean> => {
      // An absent title means "leave it alone", which is allowed. A title
      // present but blank would empty it, which is not.
      if (patch.title !== undefined && isBlankTitle(patch.title)) {
        return false;
      }

      return run(async () => ({
        type: 'cardSaved',
        card: await storage.updateCard(id, patch),
      }));
    },
    [run, storage],
  );

  const deleteCard = useCallback(
    async (id: string): Promise<boolean> => {
      return run(async () => {
        await storage.deleteCard(id);

        return { type: 'cardDeleted', cardId: id };
      });
    },
    [run, storage],
  );

  const reload = useCallback((): void => {
    setReloads((count) => count + 1);
  }, []);

  return {
    status: state.status,
    board: state.board,
    pending: state.pending,
    error: state.error,
    reload,
    addList,
    addCard,
    updateCard,
    deleteCard,
  };
}
