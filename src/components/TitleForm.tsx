// The form shared by the two additions, a column and a task.
//
// ONE COMPONENT FOR TWO USES, and the criterion was not that they look alike
// but that they ARE the same operation: name a new object and ask for its
// creation. The shape follows from the concept rather than meeting it by
// chance. The name describes what it is, a form for one title, because a
// name promising more would have to keep the promise later.
//
// THE REFUSAL IS AN AFFORDANCE, NOT A MESSAGE: the button is disabled while
// the field is blank, so the interface warns BEFORE the click instead of
// explaining after. LoginForm keeps its message because it has two fields,
// where knowing that something is missing does not say which.

import { useId, useState } from 'react';

import { isBlankTitle } from '../domain/operations.ts';

export function TitleForm({
  label,
  submitLabel,
  pending,
  onSubmit,
}: {
  label: string;
  submitLabel: string;
  pending: boolean;
  /** True when the object was really created. See use-board. */
  onSubmit: (title: string) => Promise<boolean>;
}): React.ReactElement {
  const [title, setTitle] = useState('');

  // useId, because this component is on the page TWICE: once for the board
  // and once per column. A hard coded id would give several elements the
  // same one, and every label would then point at the first field.
  const fieldId = useId();

  const blank = isBlankTitle(title);

  async function handleSubmit(
    event: React.FormEvent<HTMLFormElement>,
  ): Promise<void> {
    // Without this the form navigates, the page reloads and the application
    // restarts from the stored token.
    event.preventDefault();

    // Reached only by the keyboard, since the button is disabled in both
    // cases. The Enter key performs an implicit submission whose behaviour
    // with a disabled button is not identical in every browser.
    if (pending || blank) {
      return;
    }

    const created = await onSubmit(title.trim());

    // CLEARED ONLY ON SUCCESS. Clearing on failure would destroy what the
    // user typed exactly when the application failed, which is the worst
    // moment to lose it. This is why the hook methods report a boolean.
    if (created) {
      setTitle('');
    }
  }

  return (
    <form aria-label={submitLabel} noValidate onSubmit={(event) => void handleSubmit(event)}>
      <label htmlFor={fieldId}>{label}</label>
      <input
        id={fieldId}
        type="text"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <button type="submit" disabled={pending || blank}>
        {submitLabel}
      </button>
    </form>
  );
}
