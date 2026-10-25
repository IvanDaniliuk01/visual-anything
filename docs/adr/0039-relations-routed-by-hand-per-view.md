---
status: accepted
---

<!-- Decided by Claude on 2026-10-24 under the user's standing delegation of design decisions. -->

# Relations routed by hand, per view, as in draw.io

A view can route any relation it draws as a line by hand, and keeps only what differs from the automatic route in an optional `routes` map of its own file, keyed by relation id. For each end, a route may attach the line at one of the end's connection points, by name, or at a fixed place on its border, `{ side, at }` with `at` from 0 to 1 along the side, as draw.io's fixed points and as connection points already are; an end it leaves out attaches automatically. It may hold up to 64 bend points, in canvas units relative to the shape of the container named beside them: the nearest container that held both ends' shapes when they were set, a shape counting as holding itself, or the canvas when that was World. Its style is orthogonal, the default and stored as nothing, straight or curved. Two commands change routes, each one undoable action labelled by author: `set-route`, which changes only what it names and keeps only what differs from automatic, and `reset-route`, for one relation or several; Claude has them as `set_route` and `reset_route`. The core keeps routes true to the model: deleting a relation, directly or through an end, takes its routes in every view, as the delete preview lists; deleting the container of bend points takes the bend points; changing an end of a relation sends that end back to automatic and keeps the bend points while their container still holds both ends; a connection point a route names that leaves the end's appearance is replaced, in the same action, by the point now at the same side and place or by a border attachment there, so the line does not move. Bend points whose container no longer holds both ends, and attachments that no longer fit, such as one on an element that has become a row, are kept and ignored, and come back with the containment, as positions do (ADR 0019). An end on a relation, on World, or on an element drawn inside a row takes no attachment; one on a row or a shape that draws rows attaches only beside it, on the left or right. A relation is routed once per view, along the line between its ends' first shapes; an aggregated relation takes no route. Layout writes no route: ELK takes hand-chosen ends as fixed ports and is given no bend points, and its own route is used only for relations the view routes automatically. Checking a project only warns about a route that names an unknown relation, connection point or container, or attaches an end that never can be. The canvas draws hand routes through their bend points, curved ones as cubic Bézier spans flattened for hit testing, and edits them with handles at the ends, the bend points and the middle of each segment. We chose this because a route, like a position, is a drawing choice each view makes for itself (ADR 0009) and stays out of the model (ADR 0022); because relative bend points keep a route with what it runs between when a container moves; because storing their container, rather than recomputing it, never lets a change of containment reinterpret them against another shape; and because the core, not the canvas, keeps the rule that nothing names what is gone, so the app, Claude and an undo agree.

## Considered options

- **The route stored on the relation, in the model**: rejected. Each view draws a relation in its own place, and ADR 0022 keeps drawing choices out of the model.
- **Bend points in absolute canvas units**: rejected. Moving a container would leave every route inside it behind.
- **Bend points relative to the `from` end's shape**: rejected. Moving either end alone would drag the whole route with it or leave it, depending on which end it is.
- **The container worked out again on every read**: rejected. A change of containment, or of the view's nesting relation types, would silently move every bend point to another shape.
- **Dropping bend points when their container stops holding both ends**: rejected. A drag into a container and its undo, or a view nesting by another relation type for a while, would lose the person's work, which positions keep.
- **Removing an attachment when its connection point is removed**: rejected. The line would jump to an automatic place; keeping it where it was, by the point at the same place or at a border point there, is what the person last saw.
- **A per-end "automatic" value, and `"orthogonal"` written out**: rejected. Two spellings of the same route would differ in diffs; absence is the one way to say automatic.
- **An array of routes with a relation field, as positions are**: rejected. A map keyed by relation id cannot hold two routes for one relation, and its sorted keys diff cleanly.
- **Bend points given to ELK as constraints**: rejected for v0.1. ELK's layered algorithm does not keep given bend points; layout keeps hand routes by not touching them.
- **Curved routes drawn by layout**: left for later; v0.1's curves are chosen by hand.

## Consequences

- Builds older than this refuse view files that hold `routes`; the format stays at version 1, every new key being optional. The live protocol's operations can change a view's routes, so its version goes up with this change.
- The spec's "Curved routes (after v0.1)" now means curves drawn by layout; routes curved by hand are in v0.1.
- The core settles routes after every command, and after each command inside a batch, so a batch that reconnects a relation and then attaches its new end keeps the attachment. It costs nothing while no view keeps routes, and a scan of the routes when a command changes the model or the definitions.
- After layout, hand routes stay as they were; Reset route on the selection is how relations go back to the routes layout gives.
- The delete preview gains the routes a deletion removes or loses bend points from.
