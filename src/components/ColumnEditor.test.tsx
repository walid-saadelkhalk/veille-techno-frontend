// @vitest-environment jsdom
//
// Specification of the column rename form, written before it exists.
//
// A SEPARATE COMPONENT RATHER THAN A MODE ADDED TO TitleForm, and the
// criterion is the one used at lot 5 to justify sharing: one shares when it
// is the same CONCEPT, not when it has the same shape. Creating and renaming
// are not the same concept: after a creation the field clears and stays open
// for the next one, after a rename the form CLOSES. Sharing would have meant
// a mode flag, which is exactly the prop accretion that argued against
// premature sharing in the first place.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { List } from '../domain/types.ts';
import { ColumnEditor } from './ColumnEditor.tsx';

afterEach(cleanup);

const list: List = { id: 'list-1', title: 'A faire', position: 0 };

function mount({ pending = false, succeeds = true } = {}) {
  const onSave = vi.fn().mockResolvedValue(succeeds);
  const onCancel = vi.fn();

  render(
    <ColumnEditor
      list={list}
      pending={pending}
      onSave={onSave}
      onCancel={onCancel}
    />,
  );

  return { onSave, onCancel };
}

function field(): HTMLInputElement {
  return screen.getByLabelText(/titre de la colonne/i) as HTMLInputElement;
}

function saveButton(): HTMLButtonElement {
  return screen.getByRole('button', {
    name: /enregistrer le titre/i,
  }) as HTMLButtonElement;
}

describe("l'ouverture", () => {
  it('pre-remplit le champ avec le titre actuel', () => {
    mount();

    expect(field().value).toBe('A faire');
  });
});

describe("l'enregistrement", () => {
  it('envoie le nouveau titre', async () => {
    const { onSave } = mount();

    fireEvent.change(field(), { target: { value: 'Titre corrige' } });
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ title: 'Titre corrige' }),
    );
  });

  it("n'appelle rien quand le titre n'a pas change", () => {
    // Same rule as CardEditor: an empty patch would be a round trip the
    // server answers with the very same column.
    const { onSave } = mount();

    fireEvent.click(saveButton());

    expect(onSave).not.toHaveBeenCalled();
  });

  it('retire les espaces autour du titre', async () => {
    const { onSave } = mount();

    fireEvent.change(field(), { target: { value: '  Titre corrige  ' } });
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ title: 'Titre corrige' }),
    );
  });
});

describe('le refus et l\'annulation', () => {
  it("desactive l'enregistrement quand le titre est vide", () => {
    mount();

    fireEvent.change(field(), { target: { value: '   ' } });

    expect(saveButton().disabled).toBe(true);
  });

  it('ignore une soumission au clavier avec un titre blanc', () => {
    const { onSave } = mount();

    fireEvent.change(field(), { target: { value: '   ' } });
    fireEvent.submit(
      screen.getByRole('form', { name: /enregistrer le titre/i }),
    );

    expect(onSave).not.toHaveBeenCalled();
  });

  it("Annuler n'appelle RIEN et previent le parent", () => {
    const { onSave, onCancel } = mount();

    fireEvent.change(field(), { target: { value: 'Jamais enregistre' } });
    fireEvent.click(screen.getByRole('button', { name: /annuler/i }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("desactive l'enregistrement pendant un envoi", () => {
    mount({ pending: true });

    expect(saveButton().disabled).toBe(true);
  });
});
