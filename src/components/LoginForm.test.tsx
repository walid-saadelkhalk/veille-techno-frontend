// @vitest-environment jsdom
//
// Specification of the login screen, written before it exists.
//
// The component is handed the object useAuth returns, and nothing else. It
// knows no API, no storage and no token, so these tests pass a plain object
// and mount no hook: the component displays and calls, it decides nothing.
//
// Fields are queried BY THEIR LABEL rather than by a test identifier. A test
// that finds a field the way a user finds it keeps working when the markup
// changes, and it only passes if the label is really tied to the input.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Auth } from '../auth/use-auth.ts';
import { LoginForm } from './LoginForm.tsx';

// Testing Library normally cleans the DOM up by itself, but ONLY when the
// test hooks are globals. This project imports describe and it explicitly,
// so no global afterEach exists for it to hook into, and without this line
// every rendered screen stays in the document: the second test then finds
// two buttons named "Se connecter" and fails on an ambiguity that looks like
// a bug in the component.
//
// Setting globals: true in the Vite config would have fixed it too, at the
// price of implicit globals across the whole project.
afterEach(cleanup);

function fakeAuth(overrides: Partial<Auth> = {}): Auth {
  return {
    status: 'anonymous',
    pending: false,
    error: null,
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn(),
    ...overrides,
  };
}

function fill(email: string, password: string): void {
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: email },
  });
  fireEvent.change(screen.getByLabelText(/mot de passe/i), {
    target: { value: password },
  });
}

function submit(): void {
  fireEvent.click(screen.getByRole('button', { name: /se connecter/i }));
}

describe('la soumission', () => {
  it('transmet les identifiants saisis', () => {
    const auth = fakeAuth();
    render(<LoginForm auth={auth} />);

    fill('user1@example.com', 'un-mot-de-passe');
    submit();

    expect(auth.signIn).toHaveBeenCalledWith(
      'user1@example.com',
      'un-mot-de-passe',
    );
  });

  it("refuse l'envoi quand un champ est vide, sans appeler le reseau", () => {
    // Not a duplicate of a server rule: an empty field has no chance of
    // succeeding, so the request is not worth sending. The FORMAT of the
    // email stays the server's business, see ADR-017.
    const auth = fakeAuth();
    render(<LoginForm auth={auth} />);

    fill('', 'un-mot-de-passe');
    submit();

    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('refuse un champ ne contenant que des espaces', () => {
    const auth = fakeAuth();
    render(<LoginForm auth={auth} />);

    fill('   ', '   ');
    submit();

    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('explique le refus plutot que de ne rien faire', () => {
    // A form that silently ignores a click looks broken. The user story asks
    // not to be left stuck without an explanation.
    render(<LoginForm auth={fakeAuth()} />);

    fill('', '');
    submit();

    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('ne soumet pas quand une connexion est deja en cours', () => {
    // Beyond the disabled attribute: the guard is in the handler too, because
    // the Enter key in a field triggers an implicit submission whose
    // behaviour with a disabled button varies between browsers.
    const auth = fakeAuth({ pending: true });
    render(<LoginForm auth={auth} />);

    fill('user1@example.com', 'un-mot-de-passe');
    submit();

    expect(auth.signIn).not.toHaveBeenCalled();
  });
});

describe("l'affichage", () => {
  it('affiche le message venu du hook', () => {
    render(<LoginForm auth={fakeAuth({ error: 'Identifiants invalides.' })} />);

    expect(screen.getByRole('alert').textContent).toContain(
      'Identifiants invalides.',
    );
  });

  it('rend un message contenant du HTML comme du TEXTE', () => {
    // React escapes by default, so this is a property we must not break
    // rather than a measure we take. The only way to break it would be
    // dangerouslySetInnerHTML, forbidden by the project. Shown here rather
    // than claimed, because this is what a jury asks to see.
    const hostile = '<img src=x onerror="alert(1)">';
    render(<LoginForm auth={fakeAuth({ error: hostile })} />);

    expect(screen.getByRole('alert').textContent).toContain(hostile);
    expect(document.querySelector('img')).toBeNull();
  });

  it('desactive le bouton pendant un envoi', () => {
    render(<LoginForm auth={fakeAuth({ pending: true })} />);

    // Plain DOM rather than a jest-dom matcher: that package would be an
    // eleventh dev dependency for three assertions.
    const button = screen.getByRole('button', { name: /se connecter/i });

    expect((button as HTMLButtonElement).disabled).toBe(true);
  });

  it('masque le mot de passe saisi', () => {
    render(<LoginForm auth={fakeAuth()} />);

    expect(screen.getByLabelText(/mot de passe/i).getAttribute('type')).toBe(
      'password',
    );
  });

  it('laisse le serveur valider le format, sans validation native', () => {
    // type="email" for the keyboard and the semantics, but the browser must
    // NOT block the submission: otherwise the server never answers 400 and
    // that criterion becomes untestable and undemonstrable.
    render(<LoginForm auth={fakeAuth()} />);

    // The form is queried by role, which a <form> only exposes when it has
    // an accessible name. Hence the aria-label on it, which is good practice
    // anyway on a page that will hold more than one form later.
    expect(screen.getByLabelText(/email/i).getAttribute('type')).toBe('email');
    expect(screen.getByRole('form').hasAttribute('novalidate')).toBe(true);
  });
});
