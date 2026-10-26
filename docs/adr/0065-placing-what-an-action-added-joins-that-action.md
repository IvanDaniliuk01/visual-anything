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

## Clarifications

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

- 2026-10-26 (W48): **what the build settled.**
  - **The messages.** An app's `command` carries `joins`, the id of an action as `history/listed` gives it; anything but a whole number from 1 is refused. When the program joins the placement, its `project/changed` carries `joins` with that id, and the label and author of the action it joined; `history/listed` then lists that action again, with its own id and time, and no new one.
  - **The core.** `extendNewest` extends the history's newest action, the placement's operations after the action's and their inverse before the action's, so one undo and one redo take both, exactly. `placementJoins` tells whether a placement may join, from the project before the action, which the program works out from the action's inverse, and the project after it.
  - **What the app asks to join.** Every automatic layout, of the shapes that appear without a position, asks to join the newest action done, whatever added them; Layout pressed and Claude's `lay_out_view` never ask. The program decides, so an app that asks wrongly only gets the person's own action, as before.
  - **A shape the action created or moved** is an element in the container its shape sits in, through the view's scope, that the view did not have before the action: a new element, one put in another container, or one the scope shows now.
  - **What a placement moves aside joins too.** Placing new shapes in a container now moves aside the unpinned shapes stored beside it that the container would cover as it grows (ADR-0015's clarification of this date). Those are positions of shapes the action did not create, so the rule above would keep such a placement the person's own action, and one change of Claude's would take two undos again in the very case dogfooding found. So such a move joins too, when it only makes room: the shape sits where a container that holds, at any depth, a shape the action added sits; it had a stored, unpinned position there before; it moved only right or down; and it kept its stored size. A layout that moves anything else, or anything left or up, or resizes it, stays the person's own action.
  - **The program's log** (ADR-0016's clarification) says when a placement joins an action.
