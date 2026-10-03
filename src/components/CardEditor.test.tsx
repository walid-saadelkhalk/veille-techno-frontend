// @vitest-environment jsdom
//
// Specification of the card editor, written before it exists.
//
// THE POINT OF THIS COMPONENT IS THE PATCH IT BUILDS. CardPatch means that an
// ABSENT field is left alone, so changing the title must not carry the
// description along, or editing one would silently rewrite the other. And an
// EMPTY STRING is a real value, not an absence: it is how a description gets
// emptied, and the consigne requires it never to become null.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Card as CardData } from '../domain/types.ts';
import { CardEditor } from './CardEditor.tsx';

afterEach(cleanup);

const card: CardData = {
  id: 'card-1',
  title: 'Ecrire les tests',
  description: 'Une description',
  position: 0,
  listId: 'list-1',
};

function mount({ pending = false, succeeds = true } = {}) {
  const onSave = vi.fn().mockResolvedValue(succeeds);
  const onCancel = vi.fn();

  render(
    <CardEditor
      card={card}
      pending={pending}
      onSave={onSave}
      onCancel={onCancel}
    />,
  );

  return { onSave, onCancel };
}

function titleField(): HTMLInputElement {
  return screen.getByLabelText(/titre/i) as HTMLInputElement;
}

function descriptionField(): HTMLTextAreaElement {
  return screen.getByLabelText(/description/i) as HTMLTextAreaElement;
}

function saveButton(): HTMLButtonElement {
  return screen.getByRole('button', {
    name: /enregistrer/i,
  }) as HTMLButtonElement;
}

function form(): HTMLElement {
  // Named after its submit button, not after a field: getByLabelText matches
  // an aria-label on any element, so a form named "Titre" would make that
  // query ambiguous with the input.
  return screen.getByRole('form', { name: /enregistrer/i });
}

describe("l'ouverture", () => {
  it('pre-remplit les deux champs avec la carte', () => {
    mount();

    expect(titleField().value).toBe('Ecrire les tests');
    expect(descriptionField().value).toBe('Une description');
  });
});

describe('le patch envoye', () => {
  it("n'envoie QUE le titre quand seul le titre change", async () => {
    const { onSave } = mount();

    fireEvent.change(titleField(), { target: { value: 'Titre corrige' } });
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ title: 'Titre corrige' }),
    );
  });

  it("n'envoie QUE la description quand seule elle change", async () => {
    const { onSave } = mount();

    fireEvent.change(descriptionField(), { target: { value: 'Autre texte' } });
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({ description: 'Autre texte' }),
    );
  });

  it('envoie les deux en un seul appel', async () => {
    const { onSave } = mount();

    fireEvent.change(titleField(), { target: { value: 'Titre corrige' } });
    fireEvent.change(descriptionField(), { target: { value: 'Autre texte' } });
    fireEvent.click(saveButton());

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        title: 'Titre corrige',
        description: 'Autre texte',
      }),
    );
    expect(onSave).toHaveBeenCalledOnce();
  });

  it('envoie une chaine vide pour une description videe, JAMAIS null', async () => {
    // Consigne p.2, aligned on the @default("") of the backend. An empty
    // string is a value; omitting the field would mean "leave it alone" and
    // the description would never be cleared.
    const { onSave } = mount();

    fireEvent.change(descriptionField(), { target: { value: '' } });
    fireEvent.click(saveButton());

    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ description: '' }));
  });

  it("n'appelle rien quand rien n'a change", () => {
    // An empty patch would be a round trip that changes nothing, and the
    // server would answer the same card. Cheaper to notice here.
    const { onSave } = mount();

    fireEvent.click(saveButton());

    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('le refus et l\'annulation', () => {
  it('desactive l\'enregistrement quand le titre est vide', () => {
    mount();

    fireEvent.change(titleField(), { target: { value: '   ' } });

    expect(saveButton().disabled).toBe(true);
  });

  it('ignore une soumission au clavier avec un titre blanc', () => {
    const { onSave } = mount();

    fireEvent.change(titleField(), { target: { value: '   ' } });
    fireEvent.submit(form());

    expect(onSave).not.toHaveBeenCalled();
  });

  it("Annuler n'appelle RIEN et previent le parent", () => {
    // Criterion of FRONT-14: cancelling an edition must call nothing. The
    // card is left exactly as it was, which is why the editor holds its own
    // draft and never touches the card it was given.
    const { onSave, onCancel } = mount();

    fireEvent.change(titleField(), { target: { value: 'Jamais enregistre' } });
    fireEvent.click(screen.getByRole('button', { name: /annuler/i }));

    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('desactive les boutons pendant un envoi', () => {
    mount({ pending: true });

    expect(saveButton().disabled).toBe(true);
  });
});
