// The board, empty skeleton. The real one is lot 5, FRONT-11 to FRONT-15,
// on top of the use-board hook of FRONT-10.
//
// It exists now so that the conditional render has two real branches and the
// switch after a login can be seen. It deliberately shows nothing it cannot
// do: an empty state says so, rather than pretending to be a board.

export function Board(): React.ReactElement {
  return (
    <section>
      <h2>Tableau</h2>
      <p>Aucune colonne pour l'instant. Le tableau arrive au lot 4.</p>
    </section>
  );
}
