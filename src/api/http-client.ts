// The only file in the project that calls fetch. Everything else asks this
// client, so an error status is translated once, here, instead of at every
// call site.
//
// THE TRAP THIS FILE EXISTS FOR: fetch does not reject on an error status.
// A 401, a 403 and a 500 all arrive as a RESOLVED promise, and only a network
// failure rejects. A try / catch around a bare fetch therefore catches no HTTP
// error at all, and the code carries on as if the call had worked.

/** Why a request failed, in terms the application can act on. */
export type ApiErrorKind =
  // The session is dead: the caller purges the token and goes back to login.
  | 'unauthorized'
  // The resource belongs to someone else: the caller shows a message and
  // does NOT log the user out. Confusing the two would disconnect the user
  // on every unlucky click.
  | 'forbidden'
  | 'notFound'
  // Validation refused by the server, `messages` carries what it said.
  | 'validation'
  | 'server'
  // The request never arrived. Not the same problem as the API refusing.
  | 'network';

/**
 * The single error this client throws.
 *
 * One class with a discriminant rather than one class per status: TypeScript
 * then checks that a switch over `kind` is exhaustive, so adding a case later
 * points at every place that must handle it. A family of classes compared
 * with instanceof gives no such warning.
 *
 * Fields are assigned in the body rather than declared as constructor
 * parameters, because the project forbids TypeScript syntax that emits code.
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly messages: readonly string[];

  constructor(kind: ApiErrorKind, messages: readonly string[]) {
    super(messages[0] ?? kind);
    this.name = 'ApiError';
    this.kind = kind;
    this.messages = messages;
  }
}

export interface HttpClient {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  patch<T>(path: string, body: unknown): Promise<T>;
  delete(path: string): Promise<void>;
}

const KIND_BY_STATUS: Readonly<Record<number, ApiErrorKind>> = {
  400: 'validation',
  401: 'unauthorized',
  403: 'forbidden',
  404: 'notFound',
};

function kindOf(status: number): ApiErrorKind {
  return KIND_BY_STATUS[status] ?? 'server';
}

/**
 * Reads what the server said, always as a list.
 *
 * ErrorResponseDto declares `message` as a string OR an array of strings.
 * Normalising here means no caller ever has to test the shape, so no caller
 * can forget to. An unreadable body yields an empty list rather than a crash:
 * failing to parse an error must not replace it with a different error.
 */
async function messagesOf(response: Response): Promise<readonly string[]> {
  try {
    const body: unknown = await response.json();
    const message = (body as { message?: unknown }).message;

    if (typeof message === 'string') {
      return [message];
    }

    if (Array.isArray(message)) {
      return message.filter((item): item is string => typeof item === 'string');
    }

    return [];
  } catch {
    return [];
  }
}

export function createHttpClient(
  baseUrl: string,
  getToken: () => string | null,
  // Called when, and only when, the server answers 401. The client REPORTS a
  // dead session, it does not decide what one means: purging the token and
  // telling React belong to the auth module. Optional, so every existing
  // test and caller keeps working without it.
  onUnauthorized?: () => void,
): HttpClient {
  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers = new Headers();
    // Read at call time, never captured once: the token appears at login and
    // disappears at logout, and the client has to follow.
    const token = getToken();

    if (token !== null) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    if (body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }

    let response: Response;

    try {
      response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      // The only case fetch rejects on its own. The original error carries
      // nothing useful, and rethrowing it would hide the distinction between
      // an unreachable server and a server that refuses.
      throw new ApiError('network', ['Le serveur est injoignable.']);
    }

    // Here is the line the whole file is about: without it, every error
    // status would flow on as a success.
    if (!response.ok) {
      const kind = kindOf(response.status);

      // Only on a 401. A 403 means the resource is not yours, NOT that your
      // session is dead, and confusing the two would log the user out on
      // every unlucky click. See ADR-017.
      if (kind === 'unauthorized') {
        onUnauthorized?.();
      }

      throw new ApiError(kind, await messagesOf(response));
    }

    if (response.status === 204) {
      // No body to read. Calling json() here would throw on a successful
      // deletion, which is the kind of bug that only shows up in production.
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  return {
    get: <T>(path: string): Promise<T> => request<T>('GET', path),
    post: <T>(path: string, body: unknown): Promise<T> =>
      request<T>('POST', path, body),
    patch: <T>(path: string, body: unknown): Promise<T> =>
      request<T>('PATCH', path, body),
    delete: async (path: string): Promise<void> => {
      await request<void>('DELETE', path);
    },
  };
}
