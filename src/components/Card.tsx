// One task: displayed, and editable in place.
//
// EACH CARD HOLDS ITS OWN editing BOOLEAN, rather than the board holding an
// editingCardId. Cancelling then just sets it back to false and calls
// nothing, which is the criterion of FRONT-14, and no state is lifted for a
// decision nobody else needs. Accepted consequence: two cards can be open at
// once, which is not a defect and is arguably nicer.
//
// The <article> wraps BOTH branches on purpose, so the element stays the same
// DOM node when the editor opens. A test that holds a reference to the card
// before clicking Modifier then keeps finding its way inside.

import { useState } from 'react';

import type { Card as CardData, CardPatch, List } from '../domain/types.ts';
import { CardEditor } from './CardEditor.tsx';

export function Card({
  card,
  lists,
  pending,
  onUpdate,
  onDelete,
}: {
  card: CardData;
  /** Passed through to the editor, for the move. */
  lists: readonly List[];
  pending: boolean;
  onUpdate: (patch: CardPatch) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
}): React.ReactElement {
  const [editing, setEditing] = useState(false);

  async function handleSave(patch: CardPatch): Promise<boolean> {
    const saved = await onUpdate(patch);

    // CLOSED ONLY ON SUCCESS. Closing on failure would throw away what the
    // user typed at the exact moment the application failed. Same rule as
    // TitleForm keeping its field, and the hook's boolean is what makes both
    // possible.
    if (saved) {
      setEditing(false);
    }

    return saved;
  }

  return (
    <article>
      {editing ? (
        <CardEditor
          card={card}
          lists={lists}
          pending={pending}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <h4>{card.title}</h4>

          {/* An empty description is the normal state at creation, never
              null, and an empty paragraph would take space for nothing. */}
          {card.description !== '' && <p>{card.description}</p>}

          <button
            type="button"
            disabled={pending}
            onClick={() => setEditing(true)}
          >
            Modifier
          </button>

          {/* No confirmation: the consigne asks for a deletion, and cards do
              not cascade. Deleting a COLUMN would have deserved one, and that
              is in the cut lot 13 (ADR-021). */}
          <button
            type="button"
            disabled={pending}
            onClick={() => void onDelete()}
          >
            Supprimer
          </button>
        </>
      )}
    </article>
  );
}
