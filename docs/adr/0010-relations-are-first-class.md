---
status: accepted
---

# Relations are first-class: programmable and connectable

Relation types work like components: they can be declarative or programmable, so a relation can carry behavior (a synapse with weight and delay that transmits spikes during a simulation), and a relation can itself be the end of another relation (an "API contract" governs a "communicates with", and that contract belongs to a team). We chose this because in the domains Visual Anything targets the relations between things are often as abstract and as meaningful as the things themselves, and forcing them to be turned into elements would distort how people think about them.

## Considered options

- **Declarative-only relation types; a relation that needs behavior or its own relations is turned into an element**: rejected. Simpler model and a single place where simulation lives, but makes relations second-class.

## Consequences

Programmable relation types run in the same sandbox as programmable components. The model has to handle relations whose ends are relations (drawing, deletion, layout), not just elements. Deleting a relation also deletes every relation that ends on it, after showing the user what will be deleted; a relation missing one of its ends has no meaning.
