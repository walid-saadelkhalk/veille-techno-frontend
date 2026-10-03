// The card editor, and its real subject is the PATCH it builds.
//
// CardPatch means an ABSENT field is left alone, so sending both fields every
// time would rewrite the description while the user was only renaming the
// card. And an EMPTY STRING is a value, not an absence: it is how a
// description gets cleared, and the consigne requires it never to be null.
//
// It holds a DRAFT of its own and never touches the card it was given, which
// is what makes cancelling free: nothing was changed, so nothing has to be
// undone and no call is made.

import { useId, useState } from 'react';

import { isBlankTitle } from '../domain/operations.ts';
import type { Card as CardData, CardPatch, List } from '../domain/types.ts';

export function CardEditor({
  card,
  lists,
  pending,
  onSave,
  onCancel,
}: {
  card: CardData;
  /** Every column, so the card can be moved. Added at FRONT-38. */
  lists: readonly List[];
  pending: boolean;
  onSave: (patch: CardPatch) => Promise<boolean>;
  onCancel: () => void;
}): React.ReactElement {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [listId, setListId] = useState(card.listId);

  // One id per field, because several editors can be open at once and each
  // label must point at its own.
  const titleId = useId();
  const descriptionId = useId();
  const listIdId = useId();

  const blank = isBlankTitle(title);

  /** Only what actually changed, so the rest is left alone by the server. */
  function patchOf(): CardPatch {
    const patch: { title?: string; description?: string; listId?: string } = {};
    const trimmedTitle = title.trim();

    if (trimmedTitle !== card.title) {
      patch.title = trimmedTitle;
    }

    // The description is NOT trimmed: leading spaces or line breaks are
    // content there, where a trailing space in a title is a typo.
    if (description !== card.description) {
      patch.description = description;
    }

    // Moving is a field like the others: it only travels when it changed.
    // Sending the current column would be a write for nothing, and the back
    // does not treat it as a move either.
    if (listId !== card.listId) {
      patch.listId = listId;
    }

    return patch;
  }

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    // Reached only by the keyboard, the button being disabled in both cases.
    if (pending || blank) {
      return;
    }

    const patch = patchOf();

    // An empty patch would be a round trip that changes nothing, and the
    // server would answer the very same card.
    if (Object.keys(patch).length === 0) {
      return;
    }

    await onSave(patch);
  }

  return (
    <form
      aria-label="Enregistrer"
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
    >
      <p>
        <label htmlFor={titleId}>Titre</label>
        <input
          id={titleId}
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </p>

      <p>
        <label htmlFor={descriptionId}>Description</label>
        <textarea
          id={descriptionId}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </p>

      <p>
        <label htmlFor={listIdId}>Colonne</label>
        <select
          id={listIdId}
          value={listId}
          onChange={(event) => setListId(event.target.value)}
        >
          {lists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.title}
            </option>
          ))}
        </select>
      </p>

      <button type="submit" disabled={pending || blank}>
        Enregistrer
      </button>

      {/* type button, so it does NOT submit the form. A button inside a form
          submits by default, which would save the very edition we cancel. */}
      <button type="button" disabled={pending} onClick={onCancel}>
        Annuler
      </button>
    </form>
  );
}
