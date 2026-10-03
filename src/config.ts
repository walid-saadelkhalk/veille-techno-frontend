// The configuration check, and the only reason it is a file of its own.
//
// VITE_API_URL is replaced at build time and ends up in clear in dist/, so
// it is public by construction. That is exactly why it is the ONLY VITE_*
// variable this project is allowed to have: a secret put there would be
// published, see ADR-017.
//
// The function takes the raw value as a parameter instead of reading
// import.meta.env itself. Two benefits: the failure cases are testable, since
// an argument can be made absent where an environment variable cannot, and
// exactly one place in the whole project reads the environment, which is
// main.tsx.

/** What the message tells the developer to write, rather than just "broken". */
const EXPECTED = 'VITE_API_URL=http://localhost:3000/api';

/**
 * The API base URL, or a loud failure.
 *
 * An EMPTY variable is the real case, not a missing one: the .env files of
 * this project held "VITE_API_URL=" with no value. An empty base URL is
 * worse than an absent one, because nothing breaks at startup and every
 * request silently goes to the dev server root, answering a 404 that looks
 * like a routing bug instead of a configuration mistake.
 *
 * Trailing slashes are removed because the adapters write paths as "/lists".
 * A URL ending in a slash would produce "/api//lists", which is the most
 * natural typo one can make in a .env file.
 */
export function requireApiBaseUrl(raw: string | undefined): string {
  const value = (raw ?? '').trim();

  if (value === '') {
    throw new Error(
      `Configuration manquante : VITE_API_URL n'est pas renseignee. ` +
        `Ajoutez cette ligne dans .env.local : ${EXPECTED}`,
    );
  }

  return value.replace(/\/+$/, '');
}
