// The application shell, and the ONE place that calls useAuth.
//
// This conditional render is what replaces the router cut by ADR-021. There
// is no /login route and no redirection: the shell shows one branch or the
// other. The ticket says "redirected to the board", and the honest wording
// is that a branch changes, not a URL.
//
// IT IS ALSO THE PURGE OF THE BOARD. The board is mounted inside the
// authenticated branch, so turning anonymous unmounts it and React discards
// its state with it. Nothing has to empty anything: the unmount is the
// purge, which is what the security criterion of FRONT-31 asks for.
//
// And it is confort only, never a barrier: ADR-017. Someone who forces the
// authenticated branch open in a dev tool gets an empty screen in error,
// because GET /api/lists answers 401 without a valid token. The data never
// left the server.

import { useAuth } from './auth/use-auth.ts';
import { Board } from './components/Board.tsx';
import { LoginForm } from './components/LoginForm.tsx';
import type { Services } from './services.ts';

export default function App({
  services,
}: {
  services: Services;
}): React.ReactElement {
  const auth = useAuth({
    tokens: services.tokens,
    authApi: services.authApi,
    events: services.events,
  });

  return (
    <main>
      <header>
        <h1>Kanban</h1>
        {auth.status === 'authenticated' && (
          <button type="button" onClick={auth.signOut}>
            Se déconnecter
          </button>
        )}
      </header>

      {auth.status === 'anonymous' ? <LoginForm auth={auth} /> : <Board />}
    </main>
  );
}
