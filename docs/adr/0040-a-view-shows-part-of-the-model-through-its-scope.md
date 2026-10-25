---
status: accepted
---

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

# A view shows part of the model through its scope

ADR-0025 said that in v0.1 every view shows the whole model, and that a saved filter could come later as an optional key of the view file. Imports, packages per domain and anatomy make models far larger than one view can hold, and the second benchmark (R30) puts this first in M6c. This supersedes that one line of ADR-0025: a view may show only part of the model, given by its **scope**. Everything else in ADR-0025 stands. Filters still hide what a scope shows, focus still dims or hides it, and neither is stored.

## The scope

- **Where it lives.** A view file gains an optional `scope`. Without it, the view shows the whole model, as every view does today, so files of format version 1 keep their meaning and no file is rewritten.
- **What it holds.** Four parts, each optional:
  - `include`: rules, of which an element must meet one;
  - `exclude`: rules, of which an element must meet none;
  - `added`: elements shown whatever the rules say;
  - `leftOut`: elements left out whatever the rules say.
- **The rules.** Each is one of:
  - a component, optionally with every component derived from it;
  - a relation type, which takes the elements at either end of a relation of that type;
  - a container with what sits inside it, to a depth or to every depth, through the view's nesting relation types;
  - a condition on an attribute, with the same tests as filters (`is`, `is not`, `contains`, `below`, `above`, `set`, `unset`).
- **Which elements show.**
  - With no `include` rule, every element meets the inclusion; otherwise it must meet one of them.
  - It is then left out if it meets an `exclude` rule.
  - It shows if it is in `added`, and is left out if it is in `leftOut`.
  - The commands keep `added` and `leftOut` apart, so no element is in both.
  - World always shows.
- **Which relations show.** A relation shows while both of its ends show; for a relation on a relation, while that relation shows. Rules never take relations directly.
- **Where a shape sits.**
  - A shape whose container is out of scope sits in its nearest container that shows, or directly in World.
  - Positions are stored by element and container (ADR-0019), so a position kept for the container left out is kept but not used; layout places that shape where it sits now.

## How the scope changes

- **One command for the whole scope.** `set-scope` gives a view a scope, or takes it away with `null`, as one undoable action.
- **Two commands from the canvas, the outline and the inspector.** `add-to-view` and `leave-out-of-view` add elements to the scope's `added` or `leftOut`, and take them out of the other list. Each is one undoable action.
- **Nothing here deletes.** "Leave out of this view" is never a delete, and the delete preview is unchanged; deleting from the model stays the only way to remove an element.
- **New elements.** An element created while a view with a scope is open, in that view, which its rules would not show, goes into that scope's `added` in the same action. It therefore appears where the person made it.
- **Elements that meet the rules later,** created elsewhere or by an import, appear in the view without any command.

## What follows from the scope

- **Layout** sees only the shapes in scope.
- **Collapsed containers** aggregate only the relations that show.
- **Relations leaving the view.** A shape with relations whose other end is out of scope shows how many leave the view. The inspector lists them, and Add to this view brings their ends in.
- **Scenarios.** A step whose relations are all out of the scope of the view it plays over is **outside the view**: playback names it in its caption and goes on. It is not a broken step: its relations still exist, and a broken step stays a step whose relation was deleted.
- **The perspective switcher** lists first the views with the same scope as the open one, then the others.
- **Search** (R25) finds what is out of the open view's scope. It offers the views that show it, and Add to this view.
- **Claude** gets tools to read and set a view's scope, and to add elements to a view or leave them out. Each write is one action, as every write tool is (ADR-0029).

## Considered options

- **A saved filter**, as ADR-0025 foresaw: rejected. Filters hide shapes of what a view shows, and people already use them as such. A scope decides what the view shows at all. One mechanism for both would leave unclear whether a hidden element is part of the view.
- **Only hand-picked elements,** as many diagramming tools do: rejected as the only way. Rules keep a view right as the model grows, and imports make that routine. Hand-picked elements are kept as `added` and `leftOut`.
- **A query language:** rejected for now. The four rules cover what LikeC4, Structurizr and SysML v2 views express in practice. A language could come later as a fifth rule.
- **Relations chosen by rules:** rejected. A relation whose end is not shown cannot be drawn, so relations follow their ends.

## Consequences

- The core gets the scope's evaluation, its commands and property tests:
  - a scope never changes the model;
  - the elements shown are exactly those the rules, `added` and `leftOut` give;
  - a relation shows if and only if its ends show;
  - leaving out and adding back restores exactly.
- The scene, layout, aggregation and playback take a view's scope into account, and stay within the budget at 10,000 elements.
- CONTEXT.md gains **Scope** and **Outside the view**.

## Clarifications

- 2026-10-25: a view that shows only the elements it adds by hand, as an import's page or view does (ADR 0042), excludes Essence, from which every component derives, and adds those elements. It needs no fifth kind of rule.
