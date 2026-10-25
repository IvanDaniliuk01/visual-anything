---
status: accepted
---

# Project file format, version 1

The files of a project follow these choices, which the spec left open:

- **World** is the model file's `world`, a full element created from Essence; every other element is in `elements`. An element with no container under a view's nesting relation types sits directly in World.
- **Containment** exists only as relations whose relation type nests; the container is the relation's `to` end, as in "A is part of B". Containment never forms a cycle across all nesting relation types together, so that no view can choose a combination that cycles.
- **Ids** are a readable base made from a name, followed by six random base-36 characters, such as `booking-agent-k3f9q2`, so that they are never reused and a broken step never comes to mean another relation. Elements and relations share one namespace, because a relation can end on either. Component and relation type ids start with their package's id, as in `systems.service`.
- **Particularities** have no key of their own: they are an element's or a relation's attribute values that differ from the default its component or relation type gives or that it does not define, and its own `appearance` (a relation's since ADR-0035). A value for an attribute without a default is ordinary data, not a particularity.
- **Positions** in a view are keyed by an element and the container its shape sits in, relative to that container's shape; every copy of a container shares its inner layout. `pinned: true` marks a position set by hand. A position stays when its element leaves that container, or when the view stops nesting by the relation type that put it there, so that the layout comes back with the containment; it goes when its element or its container is deleted.
- **Deleting an element** deletes the relations that end on it, the relations that end on those, and its positions in every view. What it contained is not deleted: it moves to its other containers, or to World.
- **"Relates to" is undirected**; relation types that derive from it set their own direction.
- **Writing** orders keys as the published JSON Schema lists them, sorts the keys of free-form objects such as attribute values, indents with two spaces, uses LF and ends with a newline. A folder written this way round-trips without changes.

We chose each of these as the simplest representation that keeps the rules in `CLAUDE.md` checkable and git diffs small, and that later milestones can extend without changing what is already stored.

## Considered options

- **Elements nested in their containers' JSON**: rejected. An element can have several containers (ADR-0007), and nesting is chosen per view.
- **Deleting a container's contents with it**: rejected. Containment is one relation among others; deleting it should not delete elements the user did not choose.
- **Ids made from names alone, with a counter for clashes**: rejected. A deleted id could come back and silently repair a broken step with the wrong relation.
- **Alphabetical key order everywhere**: rejected. `id` and `name` first read better in a diff.

## Clarifications

- 2026-10-24: a particularity is a value that differs from the default its component gives, not any value an element sets. A value for an attribute without a default is ordinary data. The Particularities bullet above and CONTEXT.md now say so.
- 2026-10-24: a position stays when its element leaves its container, or when the view stops nesting by that relation type, so that the layout comes back with the containment (the Positions bullet above).
- 2026-10-24: a relation's own appearance is a particularity too (ADR-0035); the Particularities bullet above says so, and no longer says "field", which CONTEXT.md avoids. Colors are written `#RRGGBB`, and commands write new ones in capitals; nothing rewrites a color read from a file (ADR-0033).
- 2026-10-25: every place and size on the canvas is at most ten million canvas units from 0 either way. That covers the x and y of positions, notes and points (arrow ends and bend points), and the width and height of positions and notes. The schema says so, and every command that stores one refuses anything past it, with `invalid-command`. In single precision, which the GPU draws in, numbers past it no longer hold whole units, and no real view comes near: ten thousand shapes in a row take about two million.
