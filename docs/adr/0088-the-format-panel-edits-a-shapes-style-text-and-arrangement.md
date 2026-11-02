---
status: accepted
---

<!-- Decided by Claude on 2026-11-02 under the user's standing delegation of design decisions, after the user asked for "la modificación con cada componente como tiene draw.io", with screenshots of draw.io's Style, Text and Arrange tabs. -->

# The format panel edits a shape's style, text and arrangement, as draw.io's does

The inspector already lets a person change a selected element's shape kind, fill and stroke, a relation's stroke, width and dash, the stacking order, and, on the canvas, sizes, alignment and the grid. Everything else about how one shape looks comes only from its component or from drawing defaults (ADR 0086), and sizes and positions have no fields. draw.io shows all of it for the selection in three tabs. The user wants the same.

## Decision

- **The inspector's appearance for a selection becomes the format panel, with three tabs: Style, Text and Arrange.** It shows for one or several selected shapes, relations, notes and free arrows. A value the selection does not share shows as mixed, and setting it sets it on every selected item in one action.
- **Style and Text are appearance, stored as particularities of the element or relation** (ADR 0034's order: own appearance, component, project appearance, Essence; then drawing defaults). They draw the same in every view, as every appearance does. Styling one shape in one view only stays rejected (ADR 0034). The panel's scope choice, "Only this element" or "Every <component>", stays, and "Set as the project's default" writes a project appearance.
- **New appearance traits**, each optional, each undefined meaning "as the component, then drawing defaults":
  - **Style:** `borderWidth` and `dash` on shapes (as relations have), `cornerRadius`, `opacity` (0.2 to 1), `shadow` (`none` or `soft`), and `gradient` (a second stored color and a direction, top to bottom or left to right). Stored colors stay `#RRGGBB` (ADR 0033).
  - **Text:** `font` (the fonts drawing defaults allow), `fontSize`, `bold`, `italic`, `underline` (the whole name; emphasis inside text stays Markdown, ADR 0082), `textAlign` (left, center, right), `textPlacement` (exists: top, middle, bottom), `labelPosition` (inside, or a tag above, below, left or right, which generalizes name tags), `textColor`, `labelFill` and `labelStroke` for a label's back, `wrap`, and `padding`. A text color that reads under 4.5:1 on its fill is pointed out, never refused.
- **Arrange is the view's**, since it is layout: numeric width, height (with "Keep proportions") and position for the selection, stored as today in the view's shape positions and pinning the shape; stacking order (exists); align and distribute (exists, ADR 0074); "Same size" (exists); the container a shape sits in (draw.io's "Group"); pin and unpin (draw.io's "Lock"); and, new, `rotation` in degrees and `flip` (horizontal, vertical) of a shape in a view. A rotated shape draws its outline, fill and image rotated and keeps its name level; lines attach to its rotated outline; layout and routing use its rotated bounds. Rotation and flip do not apply to containers drawn as regions or to rows.
- **Copy appearance and paste appearance** copy every Style and Text trait of one item and set them on the selection in one action; "Copy size" is the existing "Same size".
- **A palette of swatches** comes first in every color field: twelve colors chosen to pass the contrast tests on both canvases, held in core beside the built-in colors, then the project's colors and recent ones (A2).
- **Changed by commands, as today:** `update-element` and `update-relation` take the new traits, `set-component-appearance` and project appearances take them too, and `set-positions` takes `rotation` and `flip`. Every change is undoable and records its author. Claude reads and sets them through its existing appearance tools, which list the new traits; `capture_view` checks the result.
- **Everything that draws reads them:** the canvas, far-out drawing, the read-only page, SVG and PDF, and comparisons. The frame budget at 10,000 elements holds with every trait set on every shape (shadows and gradients drawn once per tile, as A5's shadows are), and the contrast tests cover the palette.

## Considered

- **Per-view styling, as draw.io's per-cell styles:** rejected again, for ADR 0034's reasons: a model shown in several views would drift, and Claude would have to repeat every change in every view.
- **A free-form style string, as draw.io's:** rejected. Named, typed traits are validated on open, diffed by versions and merged (ADR 0072).
- **Glass and Sketch:** left out. They are decoration the Clean look does not want; a preset may add them later.
