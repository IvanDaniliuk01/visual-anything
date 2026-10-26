---
status: accepted
---

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

# Placing what an action added joins that action

When Claude adds elements without positions, the open app lays out their new shapes (ADR-0015). It records that layout as an action of the person's, after Claude's (ADR-0029). Modeling Visual Anything with itself (M6, W46) showed what follows:

- one change Claude makes takes two undos;
- the history says the person did half of it;
- `change_container` without positions does the same.

## Decision

The placement of the shapes an action created, or moved into another container, joins that action in the history.

- **How the app asks.** When the app lays out the new shapes of the newest action, it sends its `set-positions` with `joins`, the id of that action as the history lists it.
- **What the program checks.** The program appends the layout's operations to that action's history entry, under its author and label, only when:
  - that action is still the newest one and is not undone;
  - every position it sets is of a shape that action created or moved;
  - every position is unpinned.

  In any other case the layout is recorded as its own action, the person's, as before, so a layout that comes late or does more never rides on someone else's action.
- **Undo and redo** take the action and its placement together. The history panel shows one entry.
- **Every app sees it** as an amended action: `history/listed` sends the entry again with its new operations, and the apps that applied the first part apply the rest, as they apply any change.
- **The same holds for the person's own additions** that the app places, such as Add on the canvas without a drop point.

## Considered options

- **Crediting the layout to Claude as an action of its own:** rejected. The layout ran in the person's app, and an app must never be able to sign for Claude (ADR-0029, ADR-0059).
- **Laying out in the program, before the action is recorded:** rejected for now. Layout runs in the app's worker (ADR-0015), and the program has no ELK.

## Consequences

- The live protocol's command message gains an optional `joins`. The core's history gains a way to extend its newest entry, and its property tests cover undo and redo of an extended entry.
- ADR-0015 and ADR-0029 gain a clarification pointing here.
