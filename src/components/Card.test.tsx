// @vitest-environment jsdom
//
// Specification of the card and of its own editing state.
//
// EACH CARD HOLDS ITS OWN editing BOOLEAN, rather than the board holding an
// editingCardId. Cancelling then just sets it back to false and calls
// nothing, which is the criterion of FRONT-14, and no state is lifted for a
// decision nobody else needs. Accepted consequence: two cards can be open at
// once, which is not a defect.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Card as CardData, List } from '../domain/types.ts';
import { Card } from './Card.tsx';

afterEach(cleanup);

const card: CardData = {
  id: 'card-1',
  title: 'Ecrire les tests',
  description: 'Une description',
  position: 0,
  listId: 'list-1',
};

/** Added at FRONT-38: the editor needs the columns to move between. */
const lists: readonly List[] = [
  { id: 'list-1', title: 'A faire', position: 0 },
  { id: 'list-2', title: 'En cours', position: 1 },
];

function mount({ saveSucceeds = true } = {}) {
  const onUpdate = vi.fn().mockResolvedValue(saveSucceeds);
  const onDelete = vi.fn().mockResolvedValue(true);

  render(
    <Card
      card={card}
      lists={lists}
      pending={false}
      onUpdate={onUpdate}
      onDelete={onDelete}
    />,
  );

  return { onUpdate, onDelete };
}

function openEditor(): void {
  fireEvent.click(screen.getByRole('button', { name: /modifier/i }));
}

describe("l'edition", () => {
  it("n'affiche pas l'editeur avant qu'on le demande", () => {
    mount();

    expect(screen.queryByLabelText(/titre/i)).toBeNull();
  });

  it('ouvre l\'editeur sur Modifier', () => {
    mount();

    openEditor();

    expect(screen.getByLabelText(/titre/i)).toBeTruthy();
  });

  it('ferme l\'editeur sur Annuler, sans rien appeler', () => {
    const { onUpdate } = mount();
    openEditor();

    fireEvent.click(screen.getByRole('button', { name: /annuler/i }));

    expect(screen.queryByLabelText(/titre/i)).toBeNull();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('ferme l\'editeur apres un enregistrement reussi', async () => {
    mount({ saveSucceeds: true });
    openEditor();

    fireEvent.change(screen.getByLabelText(/titre/i), {
      target: { value: 'Titre corrige' },
    });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(screen.queryByLabelText(/titre/i)).toBeNull());
  });

  it('LAISSE l\'editeur ouvert quand l\'enregistrement echoue', async () => {
    // Closing it would throw away what the user typed at the exact moment
    // the application failed. Same rule as TitleForm keeping its field.
    const { onUpdate } = mount({ saveSucceeds: false });
    openEditor();

    fireEvent.change(screen.getByLabelText(/titre/i), {
      target: { value: 'Titre corrige' },
    });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(onUpdate).toHaveBeenCalledOnce());
    expect(screen.getByLabelText(/titre/i)).toBeTruthy();
  });
});

describe('la suppression', () => {
  it('appelle la suppression sur Supprimer', () => {
    const { onDelete } = mount();

    fireEvent.click(screen.getByRole('button', { name: /supprimer/i }));

    expect(onDelete).toHaveBeenCalledOnce();
  });
});
