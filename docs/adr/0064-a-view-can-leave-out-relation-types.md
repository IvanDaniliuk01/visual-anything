---
status: accepted
---

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

# A view can leave out relation types

Modeling Visual Anything with itself (M6, W46) showed that a view of a code base's structure draws every call, connection and dependency between its parts. Those are the lines a view of how the parts nest has no use for. Today only filters can hide them, and filters belong to the open tab (ADR-0025), so the view itself cannot say what it is about.

A scope (ADR-0040) chooses elements. Its `relation-type` rule picks the elements at either end of such relations, and a relation shows when both its ends show. A view therefore has no way to leave out relations whose ends it shows.

## Decision

A view file gains an optional `relationTypesLeftOut`: relation types whose relations the view does not draw, each with the types derived from it unless `exactly`.

- **What it changes.** Such a relation is not drawn as a line, is not aggregated into a collapsed container's relations, and gives a shape no count of relations leaving the view. It stays in the model, the outline, the inspector and search, as anything a view does not draw does.
- **What it cannot leave out.** A relation type the view nests by draws containment, not lines, so it cannot be left out; `set-view` refuses it.
- **Scenarios.** A step on a relation the view leaves out plays as a step outside the view, with the mark ADR-0040 gives steps whose relations a scope leaves out.
- **Where it is set.** In the view's inspector, beside the scope. Claude sets it with `set_scope`, or a tool of its own if that reads better, in one undoable action. View addresses keep pointing at the view: what it leaves out is part of the view, not of the tab.
- **Deleting a relation type** takes it out of every view's list in the same action, as deleting an element takes it out of scope lists.

## Considered options

- **A scope rule that excludes relations:** rejected. A scope's rules choose elements, and mixing in rules that choose lines would make the include and exclude lists read two ways.
- **Kept filters:** rejected. Filters are the tab's (ADR-0025), and what a view is about belongs to the view, in git.

## Consequences

- The schema's `ViewFile` gains `relationTypesLeftOut`, checked like the scope's lists, and the core's commands set it and keep it in step with deletions.
- The scene, aggregation, search's view grouping, playback and the read-only page follow it.
- CONTEXT.md gains the term in the View entry.

## Clarifications

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

- 2026-10-26 (W48): **what the build settled.**
  - **A command of its own.** The core's `set-relation-types-left-out` sets the view's list whole, as one action that changes only the view's file; an empty list draws every relation type again. It reads better than a part of `update-view`, whose label could not say what changed, or of `set-scope`, whose scope this ADR keeps apart. The history names it by what changed: `Leave the relations of "calls" out of "Structure"`, `Draw the relations of "calls" in "Structure" again`, `Draw every relation type in "Structure"`, or `Change which relation types "Structure" leaves out`. The file keeps the list sorted by relation type, each once, `exactly` only when true.
  - **What it refuses.** A relation type the view nests by, named in the list, is refused with `not-drawn-as-line`. An entry that covers one by derivation, such as "relates to" with what derives from it, is taken, and the relation types the view nests by stay out of it: so "relates to" leaves out every line and keeps the containment. `update-view` refuses to nest by a relation type the list names (`in-use`), until the view draws it again.
  - **The core's reading.** `shownByScope(…).relation` answers whether the view draws a relation, through its scope and the relation types it leaves out, and `relationByScope` whether the scope alone shows it, which tells a relation that leaves the view from one left out by its type; `relationTypesLeftOutBy` answers which relation types a view leaves out. The scene, aggregation, the count of relations that leave the view, search's grouping by view, the timeline, playback's markers, Claude's counts and the read-only page all read them.
  - **Steps.** A step whose relations are all left out by their types plays outside the view, with its mark, and the step panel says that the view leaves out their relation types, with nothing to add.
  - **Claude** reads the list with `get_scope` and `read_view`, and sets it with a tool of its own, `leave_out_relation_types`, whole each time, as one action.
  - **Opening** warns about an entry that names a relation type no package in use defines; it still leaves out the relations of exactly that id.
