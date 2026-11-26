---
status: accepted
---

<!-- Asked by the user on 2026-11-26: arrows whose animations can be customized with an SVG or a GIF, first while a view is shown and later, apart from this, in tours. The model, the defaults and what stays out were decided by the main session under the user's standing delegation of design decisions. Adds to ADR 0027, 0035 and 0088. -->

# A relation can send travelers along its line

The canvas moves things along lines only while a tour plays: a pulse's disc (ADR 0084) and the flowing dash of a step in its own style (ADR 0100). Both look the same in every project. A model that explains how something flows (invoices between services, samples between a ward and a lab, data between a pipeline's stages) is clearer when what flows is drawn as what it is, an envelope, a test tube, a row, and moves while the view is simply shown.

## Decision

### A traveler is a trait of a relation's appearance

- **`RelationAppearance.traveler`**, a `Traveler` or `none`. A relation type sets it for its relations, a project appearance overrides it for a built-in type or another package's (ADR 0034), and a relation's own appearance overrides it for that relation; `none` takes an inherited one away. It is replaced whole, never merged field by field. "Relates to" has none, so nothing moves in a project that sets none.
- **`Traveler { image, size?, speed?, spacing? }`:**
  - `image` names a package image (ADR 0027), SVG or bitmap, from a package the project uses. It draws in its own colors, as a `drawing` placement does; it is never tinted.
  - `size`: its larger side on screen, in pixels, whatever the zoom, from 8 to 64; 20 when left out.
  - `speed`: `slow`, `normal` or `fast`, 60, 120 or 240 canvas units a second; `normal` when left out.
  - `spacing`: canvas units between one traveler and the next on the same line, from 40 to 2,000; 240 when left out. A line shorter than its spacing carries one.
- **The core checks it** as it checks a component's image: an unknown image is refused with `unknown-image`, and removing an image a relation type, a project relation-type appearance or a relation still sends is refused with `in-use`.
- **Resolved, it is optional:** `ResolvedRelationAppearance.traveler` is absent when none applies and never holds `none`.

### How the canvas draws it

- **It travels from the `from` end to the `to` end** of a directed relation's drawn route, hand routes and curves included, at constant speed, and starts again from the `from` end. An undirected relation's travelers go from both ends toward the middle, as its pulses do.
- **It turns with the line and stays upright:** rotated to the route's direction where it is, and mirrored across that direction while it heads left, so a truck never drives upside down.
- **It is drawn above its line and below shapes**, at the line's opacity and fade (ADR 0088, a selection's fade), and not at all where its line is not drawn: a relation type the view leaves out (ADR 0064), a line in a collapsed container. An aggregated line of a collapsed container carries its type's traveler.
- **Only on screen, only when it shows.** Travelers move only on lines that are on screen, and the canvas asks for frames only while one of them is; with none on screen it draws nothing more. A line whose length on screen is under twice the traveler's size carries none. At most 2,000 travelers are drawn a frame; past that the lines nearest the screen's center keep theirs.
- **Still under reduced motion.** When the person's Motion preference or the system asks for reduced motion, travelers stand still at their spacing, the first half a spacing from the `from` end, so the picture still says what goes where.

### A view can keep them still or hide them

- **`ViewFile.travelers`**, `still` or `hidden`; left out, they move. `update-view` sets it and removes it with `moving`; the view's reading controls offer the three.

### Outside the canvas

- **Exports draw them still:** the SVG, the PDF made from it and the PNG draw each traveler where reduced motion would stand it. The read-only page draws them as the canvas does, moving.
- **Claude** sets a traveler through `set_appearance` and reads it through `get_item` and `read_view`; its pictures of a view (ADR 0081) are still pictures and show them still.

### What stays out

- **Animated pictures.** A package image is never animated (ADR 0027), so a traveler is still in itself and its movement along the line is its animation. A GIF traveler, whose frames play as it travels, needs package images that may be animated, and comes with its own ADR.
- **Tours.** A tour step does not change travelers yet; they keep moving while a tour or a scenario plays. Tours' own animations are a separate change.
- **SVG animation inside the file** (SMIL, CSS) is removed by the cleaning, as before (ADR 0067).

## Considered options

- **A traveler per view rather than per relation type.** Rejected: what flows along a relation is part of what the relation type means, as its color is, and the same type would need it set in every view. A view only chooses whether it moves.
- **Speed in pixels on screen.** Rejected: spacing is in canvas units so that travelers sit the same way on a line at any zoom, and a speed in other units would make them bunch or spread as the person zooms.
- **Drawing travelers in the tiles.** Rejected: tiles are redrawn only when what they hold changes (ADR 0045); a layer above them, as styled marks use, redraws only what moves.
