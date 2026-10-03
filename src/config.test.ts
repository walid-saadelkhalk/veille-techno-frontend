// Specification of the configuration check, written before it exists.
//
// The function under test is pure and takes the raw value as a parameter
// rather than reading import.meta.env itself. That is what makes the failure
// cases testable at all: an environment variable cannot be made absent from
// inside a test, but an argument can.

import { describe, expect, it } from 'vitest';

import { requireApiBaseUrl } from './config.ts';

describe('requireApiBaseUrl', () => {
  it("rend l'URL telle quelle quand elle est renseignee", () => {
    expect(requireApiBaseUrl('http://localhost:3000/api')).toBe(
      'http://localhost:3000/api',
    );
  });

  it('retire la barre oblique finale', () => {
    // Without this, every path would produce a double slash, since the
    // adapter writes "/lists" and the server would see "/api//lists".
    expect(requireApiBaseUrl('http://localhost:3000/api/')).toBe(
      'http://localhost:3000/api',
    );
  });

  it('leve quand la variable est absente, et nomme ce qui manque', () => {
    expect(() => requireApiBaseUrl(undefined)).toThrow(/VITE_API_URL/);
  });

  it('leve quand la variable est une chaine vide', () => {
    // THE REAL CASE, found while closing FRONT-30: both .env files hold
    // VITE_API_URL= with no value. An empty base URL is worse than a missing
    // one, it sends requests to the dev server root and answers a 404 that
    // does not look like a configuration mistake.
    expect(() => requireApiBaseUrl('')).toThrow(/VITE_API_URL/);
  });

  it("leve quand la variable ne contient que des espaces", () => {
    expect(() => requireApiBaseUrl('   ')).toThrow(/VITE_API_URL/);
  });

  it("dit quelle valeur est attendue, pas seulement que c'est casse", () => {
    expect(() => requireApiBaseUrl(undefined)).toThrow(/localhost:3000/);
  });
});
