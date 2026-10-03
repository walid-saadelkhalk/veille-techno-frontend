// Specification of the only file that knows the authentication route.
//
// It takes an HttpClient rather than calling fetch, so these tests hand it a
// fake object and no network is involved. Same injection as api-storage.ts.

import { describe, expect, it, vi } from 'vitest';

import { ApiError, type HttpClient } from './http-client.ts';
import { createAuthApi } from './auth-api.ts';

/** An HttpClient whose post is a spy, the other methods being unused here. */
function clientWith(post: HttpClient['post']): HttpClient {
  return {
    post,
    get: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  };
}

describe('createAuthApi.login', () => {
  it("appelle la route de connexion avec l'email et le mot de passe", async () => {
    const post = vi.fn().mockResolvedValue({ accessToken: 'un.jeton' });
    const api = createAuthApi(clientWith(post));

    await api.login('utilisateur@exemple.test', 'un-mot-de-passe');

    expect(post).toHaveBeenCalledWith('/auth/login', {
      email: 'utilisateur@exemple.test',
      password: 'un-mot-de-passe',
    });
  });

  it('rend le jeton contenu dans la reponse', async () => {
    const api = createAuthApi(
      clientWith(vi.fn().mockResolvedValue({ accessToken: 'un.jeton' })),
    );

    await expect(api.login('utilisateur@exemple.test', 'un-mot-de-passe')).resolves.toBe(
      'un.jeton',
    );
  });

  it("laisse passer l'erreur du client sans la transformer", async () => {
    // A wrong password answers 401, and the caller needs the kind intact to
    // tell it apart from a dead session. Wrapping it here would lose that.
    const refused = new ApiError('unauthorized', ['Identifiants invalides.']);
    const api = createAuthApi(clientWith(vi.fn().mockRejectedValue(refused)));

    await expect(api.login('utilisateur@exemple.test', 'faux')).rejects.toBe(refused);
  });
});
