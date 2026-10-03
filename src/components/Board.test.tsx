// @vitest-environment jsdom
//
// Specification of the three screens, written before they exist.
//
// Mounted on the IN MEMORY adapter, so this file exercises the whole tree,
// Board plus Column plus Card plus the real useBoard, with no server and no
// database. That is what makes the deletion triplet writable at pass C and
// what makes the architecture claim of lot 2 executable rather than stated.
//
// The seeded board is deliberately OUT OF ORDER, positions 5 before 0 and
// card 1 before card 0, so that a missing sort fails instead of passing by
// luck on data that happened to arrive sorted.

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '../api/http-client.ts';
import type { Board as BoardData } from '../domain/types.ts';
import { emptyBoard } from '../domain/types.ts';
import { createMemoryStorage } from '../storage/memory-storage.ts';
import type { BoardStorage } from '../storage/storage.ts';
import { Board } from './Board.tsx';

afterEach(cleanup);

const seeded: BoardData = {
  lists: [
    { id: 'list-b', title: 'En cours', position: 5 },
    { id: 'list-a', title: 'A faire', position: 0 },
  ],
  cards: [
    {
      id: 'card-2',
      title: 'Deuxieme carte',
      description: '',
      position: 1,
      listId: 'list-a',
    },
    {
      id: 'card-1',
      title: 'Premiere carte',
      description: 'Une description',
      position: 0,
      listId: 'list-a',
    },
  ],
};

function storageFailingToLoad(): BoardStorage {
  return {
    ...createMemoryStorage(),
    load: () =>
      Promise.reject(new ApiError('network', ['Le serveur est injoignable.'])),
  };
}

/** The titles of the columns, in the order the document shows them. */
function columnTitles(): readonly string[] {
  return screen
    .getAllByRole('heading', { level: 3 })
    .map((heading) => heading.textContent ?? '');
}

describe("l'ecran de chargement", () => {
  it('annonce le chargement', () => {
    const storage = createMemoryStorage(seeded);

    render(<Board storage={storage} />);

    expect(screen.getByText(/chargement/i)).toBeTruthy();
  });

  it('ne dit PAS que le tableau est vide pendant le chargement', () => {
    // THE CRITERION THE WHOLE STATE SHAPE EXISTS FOR. Saying "aucune
    // colonne" while the request runs is an interface bug, and it is the one
    // a local storage would never have revealed.
    const storage = createMemoryStorage(emptyBoard);

    render(<Board storage={storage} />);

    expect(screen.queryByText(/aucune colonne/i)).toBeNull();
  });
});

describe("l'ecran du tableau", () => {
  it('affiche les colonnes triees par position', async () => {
    render(<Board storage={createMemoryStorage(seeded)} />);

    await waitFor(() => expect(columnTitles()).toHaveLength(2));
    expect(columnTitles()).toEqual(['A faire', 'En cours']);
  });

  it('affiche les cartes dans leur colonne, triees par position', async () => {
    render(<Board storage={createMemoryStorage(seeded)} />);
    await waitFor(() => expect(columnTitles()).toHaveLength(2));

    // Scoped to the column: a card showing up in the wrong one would pass a
    // global query and fail this one.
    const column = screen.getByRole('region', { name: 'A faire' });
    const titles = within(column)
      .getAllByRole('heading', { level: 4 })
      .map((heading) => heading.textContent ?? '');

    expect(titles).toEqual(['Premiere carte', 'Deuxieme carte']);
  });

  it('affiche la description quand elle existe', async () => {
    render(<Board storage={createMemoryStorage(seeded)} />);

    await waitFor(() =>
      expect(screen.getByText('Une description')).toBeTruthy(),
    );
  });

  it('garde visible et utilisable une colonne sans carte', async () => {
    render(<Board storage={createMemoryStorage(seeded)} />);
    await waitFor(() => expect(columnTitles()).toHaveLength(2));

    const column = screen.getByRole('region', { name: 'En cours' });

    expect(within(column).getByText(/aucune tâche/i)).toBeTruthy();
  });

  it('affiche un titre contenant du HTML comme du TEXTE', async () => {
    // Written once for the four tickets of lot 5, which all carry this
    // criterion. React escapes by default, so this is a property not to
    // break rather than a measure to take, and a fourth identical test would
    // prove nothing the first does not.
    const hostile = '<script>alert(1)</script>';
    const storage = createMemoryStorage({
      lists: [{ id: 'list-a', title: hostile, position: 0 }],
      cards: [],
    });

    render(<Board storage={storage} />);

    await waitFor(() => expect(screen.getByText(hostile)).toBeTruthy());
    expect(document.querySelector('script')).toBeNull();
  });
});

describe("l'etat vide", () => {
  it('dit quelque chose d\'utile quand il n\'y a aucune colonne', async () => {
    render(<Board storage={createMemoryStorage(emptyBoard)} />);

    await waitFor(() => expect(screen.getByText(/aucune colonne/i)).toBeTruthy());
  });
});

describe("l'ecran d'erreur", () => {
  it('affiche le message du serveur, jamais un ecran blanc', async () => {
    render(<Board storage={storageFailingToLoad()} />);

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Le serveur est injoignable.',
      ),
    );
  });

  it('offre de reessayer, et le bouton relance vraiment le chargement', async () => {
    // The answer to "the server is down": we stay here with a way out, and
    // we do NOT send the user back to a login form that could not possibly
    // work, since logging in needs the same dead server.
    const storage = storageFailingToLoad();
    const load = vi.spyOn(storage, 'load');
    render(<Board storage={storage} />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());

    screen.getByRole('button', { name: /réessayer/i }).click();

    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });
});

// Added at pass B, FRONT-12 and FRONT-13. These mount the WHOLE tree on the
// in memory adapter, so they exercise Board, Column, Card, TitleForm and the
// real useBoard together, with no server. An addition that reached the wrong
// column, or a board that showed a card the storage never accepted, would
// fail here and nowhere else.

/** Waits for the seeded board to be on screen before acting on it. */
async function mountSeeded(storage: BoardStorage): Promise<void> {
  render(<Board storage={storage} />);
  await waitFor(() => expect(columnTitles()).toHaveLength(2));
}

describe('ajouter une colonne', () => {
  it('fait apparaitre la colonne rendue par le serveur', async () => {
    await mountSeeded(createMemoryStorage(seeded));

    fireEvent.change(screen.getByLabelText(/nouvelle colonne/i), {
      target: { value: 'Termine' },
    });
    fireEvent.click(screen.getByRole('button', { name: /ajouter la colonne/i }));

    await waitFor(() => expect(columnTitles()).toContain('Termine'));
  });

  it("informe et n'ajoute rien quand l'ajout echoue", async () => {
    // "Ce qui s'affiche est ce qui est enregistre": no optimistic update, so
    // a refused addition must leave the board exactly as it was.
    await mountSeeded({
      ...createMemoryStorage(seeded),
      addList: () =>
        Promise.reject(new ApiError('network', ['Le serveur est injoignable.'])),
    });

    fireEvent.change(screen.getByLabelText(/nouvelle colonne/i), {
      target: { value: 'Termine' },
    });
    fireEvent.click(screen.getByRole('button', { name: /ajouter la colonne/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain(
        'Le serveur est injoignable.',
      ),
    );
    expect(columnTitles()).toEqual(['A faire', 'En cours']);
  });
});

describe('ajouter une tache', () => {
  it('ajoute la carte dans la colonne visee, et nulle part ailleurs', async () => {
    // The assertion that matters is the second one: the parent column
    // travels in the URL, so a wrong listId would land the card in another
    // column, and a global query would never notice.
    await mountSeeded(createMemoryStorage(seeded));
    const target = screen.getByRole('region', { name: 'En cours' });

    fireEvent.change(within(target).getByLabelText(/nouvelle tâche/i), {
      target: { value: 'Relire' },
    });
    fireEvent.click(
      within(target).getByRole('button', { name: /ajouter la tâche/i }),
    );

    await waitFor(() =>
      expect(within(target).getByText('Relire')).toBeTruthy(),
    );
    const other = screen.getByRole('region', { name: 'A faire' });
    expect(within(other).queryByText('Relire')).toBeNull();
  });

  it('fait disparaitre l\'etat vide de la colonne', async () => {
    await mountSeeded(createMemoryStorage(seeded));
    const target = screen.getByRole('region', { name: 'En cours' });

    fireEvent.change(within(target).getByLabelText(/nouvelle tâche/i), {
      target: { value: 'Relire' },
    });
    fireEvent.click(
      within(target).getByRole('button', { name: /ajouter la tâche/i }),
    );

    await waitFor(() =>
      expect(within(target).queryByText(/aucune tâche/i)).toBeNull(),
    );
  });
});
