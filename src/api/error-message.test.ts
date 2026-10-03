// Specification of the function that decides what a failure LOOKS LIKE to a
// user. Written at the S2 security pass, which found it untested.
//
// WHY THIS IS A SECURITY TEST AND NOT A COSMETIC ONE: this is the single
// place standing between a thrown thing and the screen. Without the generic
// fallback, a bug on our side would display its own message, which can carry
// an internal path, a type name or a stack. The point F3 of SECURITE.md says
// "no displayed message reveals a stack trace or an internal URL", and only
// these tests make that checkable rather than asserted.

import { describe, expect, it } from 'vitest';

import { messageOf } from './error-message.ts';
import { ApiError } from './http-client.ts';

const GENERIC = 'Une erreur inattendue est survenue.';

describe('ce qui vient du serveur est affiche', () => {
  it('rend le message porte par une ApiError', () => {
    const refused = new ApiError('unauthorized', ['Identifiants invalides.']);

    expect(messageOf(refused)).toBe('Identifiants invalides.');
  });

  it('rend le premier message quand le serveur en envoie plusieurs', () => {
    // The 400 of a validation error carries an ARRAY, normalised by the HTTP
    // client. Showing the first one is a choice: the others are usually about
    // the same field.
    const invalid = new ApiError('validation', [
      'email doit etre une adresse email valide.',
      'password doit contenir au moins 8 caracteres.',
    ]);

    expect(messageOf(invalid)).toBe('email doit etre une adresse email valide.');
  });

  it('retombe sur la phrase generique si une ApiError n\'a aucun message', () => {
    expect(messageOf(new ApiError('server', []))).toBe(GENERIC);
  });
});

describe('ce qui vient de NOUS ne fuite pas', () => {
  it('ne divulgue pas le message d\'une erreur quelconque', () => {
    // THE TEST THAT MATTERS. A bug on our side must not explain itself to
    // the user: this message could name a file, a function or a type.
    const bug = new Error(
      "Cannot read properties of undefined (reading 'listId') at src/hooks/use-board.ts:142",
    );

    expect(messageOf(bug)).toBe(GENERIC);
    expect(messageOf(bug)).not.toContain('use-board');
    expect(messageOf(bug)).not.toContain('undefined');
  });

  it('ne divulgue pas une trace d\'execution', () => {
    const withStack = new Error('boom');
    withStack.stack = 'Error: boom\n    at Object.<anonymous> (/Users/walidwade/secret/path.ts:1:1)';

    expect(messageOf(withStack)).not.toContain('/Users/');
  });

  it('tient debout sur ce qui n\'est meme pas une Error', () => {
    // A rejected promise can carry anything: a string, undefined, an object.
    expect(messageOf('une chaine jetee telle quelle')).toBe(GENERIC);
    expect(messageOf(undefined)).toBe(GENERIC);
    expect(messageOf({ message: 'un objet qui ressemble a une erreur' })).toBe(
      GENERIC,
    );
  });
});
