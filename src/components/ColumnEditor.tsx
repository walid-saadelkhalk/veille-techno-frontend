// Renaming a column.
//
// A SEPARATE COMPONENT RATHER THAN A MODE ADDED TO TitleForm. The criterion
// is the one used at lot 5 to justify sharing: one shares when it is the
// same CONCEPT, not when it has the same shape. Creating and renaming are
// not the same concept, and the difference is visible in what happens on
// success: a creation clears its field and stays open for the next one, a
// rename CLOSES. Sharing would have meant a mode flag, which is exactly the
// prop accretion that argued against premature sharing in the first place.
//
// It is the twin of CardEditor, down to the rules: blank refused, cancel
// calls nothing, closes on success only.

import { useId, useState } from 'react';

import { isBlankTitle } from '../domain/operations.ts';
import type { List, ListPatch } from '../domain/types.ts';

export function ColumnEditor({
  list,
  pending,
  onSave,
  onCancel,
}: {
  list: List;
  pending: boolean;
  onSave: (patch: ListPatch) => Promise<boolean>;
  onCancel: () => void;
}): React.ReactElement {
  const [title, setTitle] = useState(list.title);
  const fieldId = useId();

  const blank = isBlankTitle(title);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();

    // Reached only by the keyboard, the button being disabled in both cases.
    if (pending || blank) {
      return;
    }

    const trimmed = title.trim();

    // Nothing changed: the server would answer the very same column, so the
    // round trip is not worth making. Same rule as CardEditor's empty patch.
    if (trimmed === list.title) {
      return;
    }

    await onSave({ title: trimmed });
  }

  return (
    <form
      aria-label="Enregistrer le titre"
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
    >
      <p>
        <label htmlFor={fieldId}>Titre de la colonne</label>
        <input
          id={fieldId}
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </p>

      <button type="submit" disabled={pending || blank}>
        Enregistrer le titre
      </button>

      {/* type button, so it does NOT submit the form and save the very
          rename being cancelled. */}
      <button type="button" disabled={pending} onClick={onCancel}>
        Annuler
      </button>
    </form>
  );
}
