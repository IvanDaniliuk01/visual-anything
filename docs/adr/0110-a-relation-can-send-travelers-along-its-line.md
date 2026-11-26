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
- **It is drawn above its line**, below pictures, free shapes and marks, at the line's opacity and fade (ADR 0088, a selection's fade), and not at all where its line is not drawn: a relation type the view leaves out (ADR 0064), a line in a collapsed container. An aggregated line of a collapsed container carries its type's traveler.
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

## Decided while building

### The canvas and exports

The canvas and the exports (`canvas/travelers.ts`, `canvas/travelerLayer.ts`, `export/svg.ts`):

- **Where the layer lies.** This canvas draws relations' tiles above element shapes, so the traveler layer is the world's child right after the relations' tiles, below pictures, explorables, free shapes and every mark; in the SVG, the `travelers` layer is after `relations` and before `relation-names`. A traveler on a line inside a container passes over the container, as its line does. The layer is a render group of its own.
- **Spacing is evened out.** A piece of a line carries `max(1, floor(length / spacing))` travelers, spread over it evenly, so they are at least `spacing` apart and the one leaving the `to` end comes back at the `from` end in the same frame. Still, the first stands half of that step from its start; moving, each is at its still place plus `speed × time`, wrapping, on the clock every frame reads, so switching between moving and still never jumps more than the time passed.
- **An undirected line's halves** each carry their own, spaced over the half, at least one each.
- **The 2,000 a frame** count every traveler a line carries, on screen or not; lines are taken nearest first by the distance from the screen's center to their bounds, and the first that does not fit ends the choice. Only travelers within the screen, grown by the largest traveler's size, take a sprite.
- **Pictures** come from the canvas's image store under the name `travelers`, at their size times the screen's density, sharp from the start; the store keeps traveler pictures that no shape shows and makes their textures at any zoom (`TileImages.showOthers`). Nothing is drawn until a picture's texture is made, and the layer asks for frames meanwhile, unless the picture can never be drawn.
- **A line a drag or a route edit takes out of the tiles** carries none until it is drawn there again.
- **Mirrored** means heading left by more than a rounding error: a traveler going straight up or down is turned, not mirrored.
- **Exports.** The SVG and the PDF draw each traveler at its size in canvas units, as a screen at scale 1 shows it, with no cap, and leave out those on lines under twice that size; the group of a line's travelers takes its opacity, times a comparison's faintness. The PNG draws the layer still within the image, as a screen at its drawing scale shows it (twice as many pixels at 2×), at most 2,000, nearest the image's center, with the textures already made; it does not wait for others. Claude's pictures are drawn the same way.
- **Reduced motion** is read each frame; the editor gives the canvas the view's choice again when the Motion preference changes, and the read-only page when the system's setting changes, so that a frame is drawn at once.

### The model, Claude and the editors

- **Model, Claude's tools and the editing UI** (the canvas and exports are built apart):
  - `update-view` takes `travelers: "moving" | "still" | "hidden" | null`; `moving` and `null` both leave it out of the file, as `rows` and `selectionFadesLines` do.
  - `RELATION_APPEARANCE_TRAITS` now lists `opacity` and `traveler` too. It lacked `opacity`, so setting a project's own relation type's appearance whole through `set-relation-type-appearance` dropped a change of opacity; it now carries both.
  - The image check runs on what a command changed: relation types (`relationTypes` operations, and every relation type of a package an `add-package`, `replace-package` or `update-package` writes), relations, and the project appearances' relation types on `set-project`. A traveler whose image is unchanged is not checked again, so a file whose traveler names a missing image can still change its other traits; opening warns about it (`unknown-image`) and nothing is drawn for it.
  - A refusal to remove an image counts "components, elements, relation types or relations"; Claude's `remove_image` names a relation type or relation that sends it as a traveler and says to clear it with `set_appearance`.
  - `get_item` gives a relation's resolved `traveler`, its defaults filled in (size 20, speed normal, spacing 240); `read_view` gives `travelersSent`, the relation types whose lines the view draws that send a traveler, by image with a count of relations, and `travelers` when the view keeps them still or hides them.
  - The editing UI shows one Traveler control in the relation type editor (its own section after Line, at the level the project can change, as route styles) and in a relation's format panel (beside the automatic route, for only this relation or every relation of its type; choosing for the type takes back the relation's own, in the same action). Its picture is chosen as a shape's is, without placement or silhouette; a new picture goes in the relation type's own package, else the project's first, else a new one. Size, speed and spacing show while a traveler is sent, each change sending the whole traveler with defaults left out; "Send no traveler" stores `none`, and "Use the inherited value" takes the trait out. A view's reading controls offer Travelers: Moving, Still, Hidden.
  - Spanish: "viajero", "Viajeros: En movimiento, Quietos, Ocultos".
