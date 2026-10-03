// @vitest-environment jsdom
//
// Specification of the form shared by the two additions, written before it
// exists.
//
// ONE COMPONENT FOR TWO USES, and the criterion for sharing was not that the
// two forms look alike but that they ARE the same thing: name a new object
// and ask for its creation. The shape follows from that, it is not a
// coincidence. And the clear-on-success rule below is the only non trivial
// behaviour here, so it is the part worth not duplicating.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TitleForm } from './TitleForm.tsx';

afterEach(cleanup);

/** Renders the form and hands back the spy standing in for the hook. */
function mount(
  { pending = false, succeeds = true } = {},
): ReturnType<typeof vi.fn> {
  const onSubmit = vi.fn().mockResolvedValue(succeeds);

  render(
    <TitleForm
      label="Nouvelle colonne"
      submitLabel="Ajouter la colonne"
      pending={pending}
      onSubmit={onSubmit}
    />,
  );

  return onSubmit;
}

function type(title: string): void {
  fireEvent.change(screen.getByLabelText(/nouvelle colonne/i), {
    target: { value: title },
  });
}

function field(): HTMLInputElement {
  return screen.getByLabelText(/nouvelle colonne/i) as HTMLInputElement;
}

function button(): HTMLButtonElement {
  return screen.getByRole('button', {
    name: /ajouter la colonne/i,
  }) as HTMLButtonElement;
}

/** The form itself, named after its submit button. */
function form(): HTMLElement {
  // Named after the BUTTON and not after the field, deliberately:
  // getByLabelText matches an aria-label on any element, so a form named
  // "Nouvelle colonne" would make that query ambiguous between the form and
  // the input it contains.
  return screen.getByRole('form', { name: /ajouter la colonne/i });
}

describe('la soumission', () => {
  it('transmet le titre saisi', () => {
    const onSubmit = mount();

    type('En cours');
    fireEvent.click(button());

    expect(onSubmit).toHaveBeenCalledWith('En cours');
  });

  it('vide le champ apres un succes', async () => {
    const onSubmit = mount({ succeeds: true });

    type('En cours');
    fireEvent.click(button());

    // waitFor and not a bare await: the field is cleared AFTER the promise
    // returned by onSubmit resolves, so the assertion has to wait for a
    // render that has not happened yet when the click returns.
    await waitFor(() => expect(field().value).toBe(''));
    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it('CONSERVE la saisie apres un echec', async () => {
    // The reason the hook methods now return a boolean. Clearing here would
    // destroy what the user typed precisely when the application failed,
    // which is the worst possible moment to lose it.
    const onSubmit = mount({ succeeds: false });

    type('En cours');
    fireEvent.click(button());

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    expect(field().value).toBe('En cours');
  });
});

describe('le refus local', () => {
  it('desactive le bouton quand le champ est vide', () => {
    mount();

    expect(button().disabled).toBe(true);
  });

  it('desactive le bouton quand le champ ne contient que des espaces', () => {
    mount();

    type('   ');

    expect(button().disabled).toBe(true);
  });

  it('ignore une soumission au clavier sur un champ blanc', () => {
    // THE TEST I COULD NOT WRITE AT FRONT-32. Clicking a disabled button
    // proves nothing about the handler, since jsdom runs no activation
    // behaviour on a disabled control. Submitting the form directly is what
    // the Enter key does, and it bypasses the button entirely, so this one
    // really exercises the guard inside the handler.
    const onSubmit = mount();

    type('   ');
    fireEvent.submit(form());

    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("pendant un envoi", () => {
  it('desactive le bouton', () => {
    mount({ pending: true });

    type('En cours');

    expect(button().disabled).toBe(true);
  });

  it('ignore une soumission au clavier', () => {
    // Two quick clicks must not create two columns. The real guard lives in
    // the hook since FRONT-10; this one stops the request from leaving at
    // all, which also keeps the interface honest.
    const onSubmit = mount({ pending: true });

    type('En cours');
    fireEvent.submit(form());

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
