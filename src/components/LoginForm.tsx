// The login screen. It displays and it calls: every decision about what a
// failed login means was taken in use-auth, and every decision about where
// the token goes was taken two tickets ago.
//
// The only state here is the content of the two fields, which is interface
// state and not business state. A component holding a business rule is a
// defect, at the same level as a prisma. call in a controller.

import { useState } from 'react';

import type { Auth } from '../auth/use-auth.ts';

const INCOMPLETE = 'Renseignez votre email et votre mot de passe.';

export function LoginForm({ auth }: { auth: Auth }): React.ReactElement {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>): void {
    // THE LINE WITHOUT WHICH NOTHING WORKS. A form submits natively by
    // default, which RELOADS THE PAGE: React state would vanish, the token
    // would be read again at boot and the screen would flash. The most
    // classic React form bug, and the most spectacular in a demo.
    event.preventDefault();

    // Belt and braces with the disabled button below: the Enter key in a
    // field triggers an implicit submission, whose behaviour with a disabled
    // button is not identical in every browser.
    if (auth.pending) {
      return;
    }

    // The email is trimmed, the password NEVER is: a trailing space in an
    // email is a typo, in a password it is a character.
    const trimmedEmail = email.trim();

    if (trimmedEmail === '' || password.trim() === '') {
      // Not a duplicate of a server rule, see ADR-017: an empty field has no
      // chance of succeeding, so the request is not worth sending. The FORMAT
      // of the email stays the server's business, and that is why the form
      // carries noValidate: the browser must not refuse what the server has
      // to answer 400 to.
      setRefusal(INCOMPLETE);
      return;
    }

    setRefusal(null);
    // Deliberately not awaited: the handler has nothing left to do, and the
    // outcome arrives through auth.error and auth.pending.
    void auth.signIn(trimmedEmail, password);
  }

  // Our own refusal takes priority: it is the more recent of the two, since
  // nothing was sent.
  const message = refusal ?? auth.error;

  return (
    <form aria-label="Connexion" noValidate onSubmit={handleSubmit}>
      <h2>Connexion</h2>

      <p>
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          // type email for the semantics and the mobile keyboard. It does NOT
          // validate anything here, noValidate above turns that off.
          type="email"
          autoComplete="email"
          value={email}
          // The form the kick-off slide 14 gets wrong: it writes
          // onChange={() => maFonction(e.target.value)}, where e does not
          // exist. The event is the parameter of the callback.
          onChange={(event) => setEmail(event.target.value)}
        />
      </p>

      <p>
        <label htmlFor="login-password">Mot de passe</label>
        <input
          id="login-password"
          // Hidden on screen. The value lives in this state and in the
          // request body, and nowhere else: no log, no URL, no storage.
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </p>

      {/* The label stays the same while pending, so the button does not
          change width under the cursor, and the progress is said next to it
          rather than inside it. */}
      <button type="submit" disabled={auth.pending}>
        Se connecter
      </button>

      {auth.pending && <p role="status">Connexion en cours...</p>}

      {/* role alert so a screen reader announces it. Rendered as TEXT: React
          escapes by default, so a server message containing HTML is shown
          literally. That property is not something we add, it is something
          we must not break, and dangerouslySetInnerHTML is forbidden. */}
      {message !== null && <p role="alert">{message}</p>}
    </form>
  );
}
