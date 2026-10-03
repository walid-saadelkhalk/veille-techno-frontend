// How a thrown thing becomes a sentence a user can read. Extracted from
// use-auth.ts at FRONT-10, when use-board needed exactly the same rule.
//
// One place decides, so the two hooks cannot start phrasing the same failure
// differently. And the fallback is deliberately vague: anything that is not
// an ApiError is a bug on our side, and showing its raw text would leak an
// internal message, a stack or a type name into the interface.

import { ApiError } from './http-client.ts';

const UNEXPECTED = 'Une erreur inattendue est survenue.';

export function messageOf(caught: unknown): string {
  // ApiError already carries what the server said, normalised into a list by
  // the HTTP client, so no caller ever has to test the shape of `message`.
  return caught instanceof ApiError
    ? (caught.messages[0] ?? UNEXPECTED)
    : UNEXPECTED;
}
