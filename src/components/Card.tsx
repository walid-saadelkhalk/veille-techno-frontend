// One task. It displays, and at pass C it will also offer to edit and to
// delete. It computes nothing and it knows nothing of where data comes from.
//
// The domain type is imported under another name, because the component and
// the entity would otherwise claim the same identifier. The component is the
// one people write, so it keeps the short name.

import type { Card as CardData } from '../domain/types.ts';

export function Card({ card }: { card: CardData }): React.ReactElement {
  return (
    <article>
      <h4>{card.title}</h4>

      {/* An empty description is the normal state at creation, never null,
          and an empty paragraph would take vertical space for nothing. */}
      {card.description !== '' && <p>{card.description}</p>}
    </article>
  );
}
