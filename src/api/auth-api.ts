// The only file that knows the authentication route.
//
// A NOTE ON THE CLAIM MADE IN api-storage.ts: that file says it is the only
// one that knows the routes, and with this file beside it that is no longer
// literally true. The accurate wording is that one file per area owns its
// routes, the board on one side and authentication on the other, and that no
// component knows any. The comment over there has been corrected.
//
// Logging in is not an operation on the board, which is why this is not a
// method of BoardStorage: that interface describes the board, and an object
// that holds everything is an object that explains nothing.

import type { AuthTokenDto } from './dto.ts';
import type { HttpClient } from './http-client.ts';

export interface AuthApi {
  /**
   * Returns the raw token. Storing it is deliberately someone else's job:
   * this file would otherwise be a second place knowing where tokens live.
   */
  login(email: string, password: string): Promise<string>;
}

export function createAuthApi(client: HttpClient): AuthApi {
  return {
    async login(email: string, password: string): Promise<string> {
      // The password travels in the body and is never kept, never logged and
      // never put in a URL. It exists in this function and nowhere else.
      const dto = await client.post<AuthTokenDto>('/auth/login', {
        email,
        password,
      });

      // Only accessToken is kept. The API may well answer more one day, and
      // naming the field is what keeps the rest from arriving with it.
      return dto.accessToken;
    },
  };
}
