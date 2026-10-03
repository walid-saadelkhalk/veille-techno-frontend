// One column and its tasks.
//
// It receives its cards ALREADY CHOSEN rather than the whole board: a
// narrower prop means it cannot look at another column's data even by
// mistake, and Board stays the single place that reads the board.
//
// The empty column is a state of its own, not an absence of markup: a column
// without a card has to stay visible and usable, which is a criterion of
// FRONT-11 and the only way to add the first task to it at pass B.

import { useState } from 'react';

import type {
  Card as CardData,
  CardPatch,
  List,
  ListPatch,
} from '../domain/types.ts';
import { Card } from './Card.tsx';
import { ColumnEditor } from './ColumnEditor.tsx';
import { TitleForm } from './TitleForm.tsx';

export function Column({
  list,
  cards,
  lists,
  pending,
  onAddCard,
  onUpdateCard,
  onDeleteCard,
  onUpdateList,
  onDeleteList,
}: {
  list: List;
  cards: readonly CardData[];
  /** Every column, passed through to the card editor for the move. */
  lists: readonly List[];
  pending: boolean;
  /**
   * Already bound to this column by Board, so the identifier is sourced in
   * ONE place. A column that had to pass its own id could pass another's.
   */
  onAddCard: (title: string) => Promise<boolean>;
  /**
   * Taken unbound, because THIS component is the one mapping over the cards,
   * so it is the one that can source a card identifier. Same rule as Board
   * binding the list identifier for onAddCard.
   */
  onUpdateCard: (cardId: string, patch: CardPatch) => Promise<boolean>;
  onDeleteCard: (cardId: string) => Promise<boolean>;
  /** Already bound to this column by Board, like onAddCard. */
  onUpdateList: (patch: ListPatch) => Promise<boolean>;
  onDeleteList: () => Promise<boolean>;
}): React.ReactElement {
  const [renaming, setRenaming] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function handleRename(patch: ListPatch): Promise<boolean> {
    const saved = await onUpdateList(patch);

    // Closed only on success, like CardEditor: a failed rename must not
    // throw away what the user typed.
    if (saved) {
      setRenaming(false);
    }

    return saved;
  }

  // THE CONFIRMATION SAYS WHAT WILL BE LOST. Card.list carries
  // onDelete: Cascade in the database, so deleting a column deletes its
  // cards, and a confirmation that did not say so would let a user destroy
  // them without knowing. window.confirm could not have carried the count
  // without that sentence being written by hand anyway, and it would have
  // needed a global to be stubbed before it could be tested.
  const warning =
    cards.length === 0
      ? `Supprimer « ${list.title} » ? Cette colonne est vide.`
      : cards.length === 1
        ? `Supprimer « ${list.title} » et la tâche qu'elle contient ? Cette suppression est définitive.`
        : `Supprimer « ${list.title} » et ses ${cards.length} tâches ? Cette suppression est définitive.`;
  return (
    // aria-label makes this a named region, so assistive technology and the
    // tests can both say "the A faire column" rather than "the second div".
    <section aria-label={list.title}>
      {renaming ? (
        <ColumnEditor
          list={list}
          pending={pending}
          onSave={handleRename}
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <>
          <h3>{list.title}</h3>

          <p>
            <button
              type="button"
              disabled={pending}
              onClick={() => setRenaming(true)}
            >
              Renommer
            </button>

            {confirming ? (
              <>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => void onDeleteList()}
                >
                  Confirmer
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => setConfirming(false)}
                >
                  Renoncer
                </button>
              </>
            ) : (
              // The label reads "Supprimer", but the ACCESSIBLE NAME says
              // which Supprimer this is. Without it, a column would expose
              // several identical "Supprimer" buttons, its own and one per
              // card, and a screen reader user would have no way to tell
              // them apart. aria-label fixes that and keeps the visible
              // text short.
              <button
                type="button"
                aria-label="Supprimer la colonne"
                disabled={pending}
                onClick={() => setConfirming(true)}
              >
                Supprimer
              </button>
            )}
          </p>

          {confirming && <p role="alert">{warning}</p>}
        </>
      )}

      {cards.length === 0 ? (
        <p>Aucune tâche dans cette colonne.</p>
      ) : (
        <ul>
          {cards.map((card) => (
            // key IS THE IDENTIFIER, NEVER THE INDEX. React identifies list
            // items by their key to decide which ones to reuse. With the
            // index, deleting the first of three cards makes the old second
            // one land at index 0, React believes it is the same card whose
            // content changed, and it reuses its internal state: an open
            // editor or a scroll position ends up on the wrong card.
            //
            // And that bug shows up on NO other scenario, since deleting the
            // last card shifts nothing. Hence the triplet of FRONT-15.
            <li key={card.id}>
              <Card
                card={card}
                lists={lists}
                pending={pending}
                onUpdate={(patch) => onUpdateCard(card.id, patch)}
                onDelete={() => onDeleteCard(card.id)}
              />
            </li>
          ))}
        </ul>
      )}

      <TitleForm
        label="Nouvelle tâche"
        submitLabel="Ajouter la tâche"
        pending={pending}
        onSubmit={onAddCard}
      />
    </section>
  );
}
