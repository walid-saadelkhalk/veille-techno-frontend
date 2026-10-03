// One column and its tasks.
//
// It receives its cards ALREADY CHOSEN rather than the whole board: a
// narrower prop means it cannot look at another column's data even by
// mistake, and Board stays the single place that reads the board.
//
// The empty column is a state of its own, not an absence of markup: a column
// without a card has to stay visible and usable, which is a criterion of
// FRONT-11 and the only way to add the first task to it at pass B.

import type { Card as CardData, List } from '../domain/types.ts';
import { Card } from './Card.tsx';
import { TitleForm } from './TitleForm.tsx';

export function Column({
  list,
  cards,
  pending,
  onAddCard,
}: {
  list: List;
  cards: readonly CardData[];
  pending: boolean;
  /**
   * Already bound to this column by Board, so the identifier is sourced in
   * ONE place. A column that had to pass its own id could pass another's.
   */
  onAddCard: (title: string) => Promise<boolean>;
}): React.ReactElement {
  return (
    // aria-label makes this a named region, so assistive technology and the
    // tests can both say "the A faire column" rather than "the second div".
    <section aria-label={list.title}>
      <h3>{list.title}</h3>

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
              <Card card={card} />
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
