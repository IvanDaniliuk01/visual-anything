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
