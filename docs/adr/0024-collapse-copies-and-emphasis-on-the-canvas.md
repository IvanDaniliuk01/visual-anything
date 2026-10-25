---
status: accepted
---

<!-- Decided by Claude on 2026-10-24 under the user's standing delegation of design decisions. -->

# Collapsed containers, aggregated relations, copies and emphasis on the canvas

ADR-0007 says that a collapsed container hides only the copy inside it and that the relations of its contents are shown as aggregated relations; the spec adds a count and a thicker line. These choices settle what they leave open, for the canvas, the outline, playback (W7) and Claude's guidance (W6), which all draw from the same scene:

- **What a collapsed container shows.** None of its contents: they get no shape in the scene, so they cannot be pointed at, reached with the keys or listed in the outline. It is drawn at its component's size, its stored size kept for when it expands, on a sheet that shows behind it, with its name at its top and "Component · N inside" below, N counting the shapes that would sit directly in it. A collapsed container inside another collapsed one is hidden with the rest; the outermost one stands for both. An element listed as collapsed that holds nothing in the view is drawn as any other.
- **Collapsing and expanding.** Through one command, I1's `set-collapsed`, from a toggle in the top right corner of every container's shape (− expanded, + collapsed), from Alt with − and Alt with +, matched by the key's place so that ⌥ on Apple keyboards works, and from the shape menu. Alone, − and + keep zooming.
- **Which relations aggregate.** A relation is drawn as it is when both its ends show. When an end shows only through a collapsed container, it joins the aggregated relation of its relation type between the two ends as drawn; a directed type gets one for each way, an undirected one gathers both ways and says which ran back. A relation whose two ends are drawn by the same shape, as between two contents of one collapsed container, or between such a content and that container, is not drawn. The container's own relations stay as they are, side by side with the aggregated ones between the same ends. An aggregated relation is drawn with its relation type's style, wider by 1 for one relation up to 4 for eight or more, labelled "×N", at the place in model order of the first relation it stands for.
- **Copies.** An element in several containers has one shape inside each, all selected together. Its relations are drawn from its first copy that shows, in containment order; only when every copy is hidden do they aggregate, on the outermost collapsed container that holds its first copy.
- **What a line stands for.** Filters, focus, playback and guidance name relations by their ids. `standsFor(line)` gives the relations of the model a line draws: its own, or those an aggregated relation stands for. An aggregated relation's key, `aggregated ` and a JSON tail, is never an id. Pointing at it, or at its row in the outline, selects every relation it stands for.
- **The emphasis (interface I2).** What any source hides is not drawn, cannot be clicked, hovered, box-selected, selected with Ctrl+A or dropped onto, and has no row in the outline; what lies beneath is found instead. A line drawn to something hidden is hidden too. An aggregated relation is hidden when every relation it stands for is, dimmed when every one is, and highlighted when any is; lit for a relation it stands for, it lights its ends, which show that relation's ends. Highlighting wins over dimming and hiding over both. Dimmed things are drawn at 22% opacity; highlighted shapes get a halo, a ring and corner marks, and highlighted lines a wider line in the highlight color over a halo with a dot at each end, so that neither relies on color; markers are discs ringed in white at their progress along the line that draws their relation. Shape keys stay the element ids from World down, joined by `/` (`shapeKeyOf`).
- **What a change costs.** A scene is built from the last one of its view, and every shape and line equal to one drawn before is that same object, so the index, the tiles and the outline tell what changed by identity. While containment, collapse and the definitions hold, only the shapes whose element, position or started relation types changed, what holds them and what moves with them are worked out again, and only the lines on moved shapes are routed again. A property test checks after random edits that the scene and its index equal ones built from nothing.

We chose these because a container that collapses to the size it had while open hides nothing of the clutter collapsing is for; because an aggregated relation that mixed directions or relation types would say less than the relations it stands for; because drawing an element's relations from every copy would multiply the lines of every overlapping grouping, which is the case ADR-0007 is for; and because the parts of the app that emphasize know relations by their ids, never the canvas's lines.

## Considered options

- **A collapsed container keeps its stored size**: rejected. It would hide its contents without making the view any easier to read.
- **Collapsed contents kept in the scene and hidden by the renderer**: rejected. Every reader of the scene, the outline, the keys and pointing included, would have to skip them.
- **One aggregated relation per far end, whatever the relation type**: rejected. The relation type would be lost, and its style with it.
- **Aggregated relations that ignore direction**: rejected for directed types: one arrowhead cannot say both ways.
- **A relation drawn from every copy of its ends**: rejected, as above.
- **An aggregated relation's key as the id of its first relation**: rejected. Two aggregated relations can share a first relation when an element's copies sit in two collapsed containers, and a click would select only one of the relations it stands for.
- **The toggle shown only on hover**: rejected. Touch and keyboard users would never find it, and the canvas would have to redraw tiles on hover.
- **− and + alone collapse and expand**: rejected. They zoom, as in other canvases, and the keyboard help says so.

## Consequences

- The outline's rows, the inspector and Claude's read tools must say when a container is collapsed and list what an aggregated relation stands for; the scene gives `collapsed.contents` on the shape and `aggregate.relations` on the line.
- A relation inside a collapsed container cannot be recorded in a scenario until the container is expanded: its line stands for several.
- Components whose detail shows attributes or badges are drawn with them (W1's `detailParts`); a relation that turns a badge on or off makes only its `from` end's shapes again.
