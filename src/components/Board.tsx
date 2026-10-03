// The board, and the three screens a network imposes where a local storage
// would have asked for one.
//
// THE THREE SCREENS ARE THE POINT OF THIS COMPONENT:
//
//   loading            -> it says so
//   error              -> the message AND a way to retry, never a blank page
//   ready, no column   -> an empty state that says something useful
//   ready, with error  -> the board PLUS a banner, because a refused action
//                         must not take the board off the screen
//
// The last line is what ruled out a discriminated union for the state at
// FRONT-10. And the criterion "it must not say there are no columns while
// loading" is satisfied BY THE STRUCTURE here: the empty state is only
// reachable inside the ready branch, so writing it in the wrong place would
// have to be deliberate.

import { cardsOfList, sortedLists } from '../domain/operations.ts';
import { useBoard } from '../hooks/use-board.ts';
import type { BoardStorage } from '../storage/storage.ts';
import { Column } from './Column.tsx';
import { TitleForm } from './TitleForm.tsx';

export function Board({
  storage,
}: {
  storage: BoardStorage;
}): React.ReactElement {
  const view = useBoard(storage);

  // Branches in the function body, before the return, rather than nested
  // ternaries inside the JSX. The kick-off slide 15 claims React forbids
  // "else if"; it forbids statements INSIDE JSX, which is not the same
  // thing, and three branches read better this way.
  let content: React.ReactElement;

  if (view.status === 'loading') {
    // role status, so a screen reader announces it AND so the stylesheet can
    // tell it apart from the empty state, which is a plain paragraph. Three
    // distinguishable treatments, zero invented class names.
    content = <p role="status">Chargement du tableau...</p>;
  } else if (view.status === 'error') {
    content = (
      <>
        <p role="alert">{view.error}</p>
        {/* reload() has been exposed by the hook since FRONT-10. Staying here
            with a way out is deliberate: a dead server does not mean a dead
            session, and sending the user to the login screen would offer a
            form that needs the very server that is down. */}
        <button type="button" onClick={view.reload}>
          Réessayer
        </button>
      </>
    );
  } else {
    // sortedLists and cardsOfList are PURE FUNCTIONS of src/domain, written
    // and tested at lot 1. A component calling a pure function does not
    // compute, it delegates. This is the cost accepted by the flat shape of
    // ADR-007: the display filters instead of reading list.cards, and in
    // exchange the ordering is tested outside React, where sort() cannot
    // mutate the state.
    //
    // No useMemo. Filtering a few dozen cards per render costs nothing, and
    // an unmeasured optimisation is superstition. Lot 7 has the tools if it
    // ever needs measuring.
    const lists = sortedLists(view.board);

    content = (
      <>
        {/* An action that failed: the board stays, the message is added. */}
        {view.error !== null && <p role="alert">{view.error}</p>}

        {/* view.addList is passed BY REFERENCE, which works because the hook
            returns closures and has no `this`. */}
        <TitleForm
          label="Nouvelle colonne"
          submitLabel="Ajouter la colonne"
          pending={view.pending}
          onSubmit={view.addList}
        />

        {lists.length === 0 ? (
          <p>Aucune colonne pour l'instant. Ajoutez-en une pour commencer.</p>
        ) : (
          // The ONLY class name in the project: this div has no semantics of
          // its own, and selecting it with "> div" would be fragile and mute.
          <div className="columns">
            {lists.map((list) => (
              <Column
                key={list.id}
                list={list}
                cards={cardsOfList(view.board, list.id)}
                pending={view.pending}
                // Bound here, so the parent column of a new card is read in
                // one place only.
                onAddCard={(title) => view.addCard(list.id, title)}
                onUpdateCard={view.updateCard}
                onDeleteCard={view.deleteCard}
              />
            ))}
          </div>
        )}
      </>
    );
  }

  // The heading sits OUTSIDE the branches, so it does not flicker between
  // the loading screen and the board.
  return (
    <section aria-label="Tableau">
      <h2>Tableau</h2>
      {content}
    </section>
  );
}
