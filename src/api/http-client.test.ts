// Specification of the HTTP client. Written before the implementation and
// watched failing first.
//
// The assertion this whole file exists for is the second one: fetch does NOT
// reject on an error status. A 401, a 403 and a 500 all arrive as a RESOLVED
// promise, and only a network failure rejects. A naive try / catch around a
// fetch therefore catches no HTTP error at all. Every test below that expects
// a throw is testing something fetch does not do on its own.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError, createHttpClient, type HttpClient } from './http-client.ts';

const BASE_URL = 'http://localhost:3000/api';

let fetchMock: ReturnType<typeof vi.fn>;

/** A response the way fetch hands it over: resolved, whatever the status. */
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function noContentResponse(): Response {
  return new Response(null, { status: 204 });
}

function clientWith(token: string | null = null): HttpClient {
  return createHttpClient(BASE_URL, () => token);
}

/** The Request the client actually built, read from the mock. */
function lastCall(): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init };
}

function headerOf(init: RequestInit, name: string): string | null {
  return new Headers(init.headers).get(name);
}

/**
 * Runs a call that must fail and hands back the error.
 *
 * Stricter than a bare .catch(): it also fails the test when the call
 * resolves, which .catch() would silently let pass.
 */
async function captureError(run: () => Promise<unknown>): Promise<ApiError> {
  try {
    await run();
  } catch (error) {
    return error as ApiError;
  }

  throw new Error('attendu une erreur, la requete a abouti');
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('requete nominale', () => {
  it('rend le corps deserialise sur un 200', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 'list-1' }));

    await expect(clientWith().get('/lists')).resolves.toEqual({
      id: 'list-1',
    });
  });

  it('prefixe le chemin par l\'URL de base', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));

    await clientWith().get('/lists');

    expect(lastCall().url).toBe('http://localhost:3000/api/lists');
  });

  it('envoie le corps en JSON sur un POST', async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { id: 'list-1' }));

    await clientWith().post('/lists', { title: 'A faire' });

    const { init } = lastCall();
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ title: 'A faire' }));
    expect(headerOf(init, 'Content-Type')).toBe('application/json');
  });

  it('expose aussi PATCH et DELETE', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}));
    await clientWith().patch('/cards/card-1', { title: 'Apres' });
    expect(lastCall().init.method).toBe('PATCH');

    fetchMock.mockResolvedValue(noContentResponse());
    await clientWith().delete('/cards/card-1');
    expect(lastCall().init.method).toBe('DELETE');
  });
});

describe('le jeton', () => {
  it('porte l\'en-tete Authorization quand un jeton existe', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));

    await clientWith('jeton-de-test').get('/lists');

    expect(headerOf(lastCall().init, 'Authorization')).toBe(
      'Bearer jeton-de-test',
    );
  });

  it('n\'envoie aucun en-tete Authorization sans jeton', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, []));

    await clientWith(null).get('/lists');

    expect(headerOf(lastCall().init, 'Authorization')).toBeNull();
  });

  // The token is read at call time, not captured once at construction: it
  // changes when the user logs in or out, and the client must follow.
  //
  // mockImplementation, not mockResolvedValue: a Response body is a stream
  // that can only be read once, so handing the same object back twice makes
  // the second read throw. Every multi call test needs a fresh Response.
  it('relit le jeton a chaque appel', async () => {
    fetchMock.mockImplementation(() => jsonResponse(200, []));
    let token: string | null = null;
    const client = createHttpClient(BASE_URL, () => token);

    await client.get('/lists');
    expect(headerOf(lastCall().init, 'Authorization')).toBeNull();

    token = 'arrive-apres';
    await client.get('/lists');
    expect(headerOf(lastCall().init, 'Authorization')).toBe(
      'Bearer arrive-apres',
    );
  });
});

describe('reponse sans corps', () => {
  it('traite un 204 sans tenter de deserialiser', async () => {
    fetchMock.mockResolvedValue(noContentResponse());

    await expect(clientWith().delete('/cards/card-1')).resolves.toBeUndefined();
  });
});

describe('erreurs HTTP, que fetch ne leve pas de lui-meme', () => {
  it('leve sur un 401 avec le genre unauthorized', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { statusCode: 401, message: 'Unauthorized' }),
    );

    await expect(clientWith().get('/lists')).rejects.toMatchObject({
      kind: 'unauthorized',
    });
  });

  it('leve sur un 403 avec un genre DISTINCT du 401', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(403, { statusCode: 403, message: 'Forbidden' }),
    );

    await expect(clientWith().get('/lists/autrui')).rejects.toMatchObject({
      kind: 'forbidden',
    });
  });

  it('leve sur un 404 avec le genre notFound', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(404, { statusCode: 404, message: 'Not Found' }),
    );

    await expect(clientWith().get('/cards/inconnu')).rejects.toMatchObject({
      kind: 'notFound',
    });
  });

  it('leve sur un 500 avec le genre server', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, {}));

    await expect(clientWith().get('/lists')).rejects.toMatchObject({
      kind: 'server',
    });
  });

  it('rend une vraie instance d\'ApiError, utilisable dans un catch', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { message: 'Unauthorized' }));

    await expect(clientWith().get('/lists')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('le 400 et ses deux formes de message', () => {
  // ErrorResponseDto declares message as string OR string[]. Normalising it
  // here means no caller ever has to branch on the shape, so no caller can
  // forget to.
  it('normalise un message en chaine vers un tableau', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, { statusCode: 400, message: 'title ne peut pas' }),
    );

    await expect(clientWith().post('/lists', {})).rejects.toMatchObject({
      kind: 'validation',
      messages: ['title ne peut pas'],
    });
  });

  it('garde un message deja en tableau', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(400, {
        statusCode: 400,
        message: ['title est obligatoire', 'description doit etre du texte'],
      }),
    );

    await expect(clientWith().post('/lists', {})).rejects.toMatchObject({
      messages: ['title est obligatoire', 'description doit etre du texte'],
    });
  });

  it('ne plante pas sur une erreur sans corps lisible', async () => {
    fetchMock.mockResolvedValue(new Response('pas du json', { status: 400 }));

    await expect(clientWith().post('/lists', {})).rejects.toMatchObject({
      kind: 'validation',
    });
  });
});

describe('panne reseau', () => {
  // The only case where fetch rejects on its own, and it must stay
  // distinguishable from an HTTP error: the API being down is not the same
  // problem as the API refusing.
  it('leve avec le genre network quand fetch rejette', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(clientWith().get('/lists')).rejects.toMatchObject({
      kind: 'network',
    });
  });

  it('distingue la panne reseau d\'une erreur HTTP', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const reseau = await captureError(() => clientWith().get('/lists'));

    fetchMock.mockResolvedValue(jsonResponse(500, {}));
    const http = await captureError(() => clientWith().get('/lists'));

    expect(reseau.kind).not.toBe(http.kind);
  });
});

describe('securite du message d\'erreur', () => {
  it('ne laisse jamais le jeton apparaitre dans l\'erreur', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, { message: 'Unauthorized' }));
    const secret = 'jeton-ultra-secret';

    const error = await captureError(() => clientWith(secret).get('/lists'));

    expect(`${error.message} ${error.messages.join(' ')}`).not.toContain(
      secret,
    );
  });
});
