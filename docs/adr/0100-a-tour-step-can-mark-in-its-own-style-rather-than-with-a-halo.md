---
status: accepted
---

<!-- From GitHub issue #9, "Tour marks hide what they mark: emphasize relations and elements by restyling and animating them, not with a halo on top". The choices of the model, the default and what stays out were made by the main session under the user's standing delegation of design decisions; the details below were decided by Claude while building them. Supersedes the marks part of ADR 0077 and adds to ADR 0084. -->

# A tour step can mark in its own style rather than with a halo

ADR 0077 marks what a tour step marks with a halo: a ring, corners and a translucent band in the canvas's emphasis color over a shape, and a wider band of that color over a line, faded in by the halo's opacity. On a thin line the halo is louder than the line. It covers the stroke, the dash and the arrowhead, and the arrowhead is what says which way the relation runs. The user's case was a tour that explains a ticket type's buttons as a state machine: "the arrow from *Nuevo* to *En curso* is the button «Tomar»", and what showed was an orange smudge where the arrow should be ("con el trazo naranja llamativo no se llegan a ver"). Shapes have the same problem in a milder form: the ring competes with their own border and fill, a state's category color or a table's header, and makes every marked thing look alike.

## Decision

### A step chooses how it marks

- **`TourStep.emphasis` and `TourFile.emphasis`, each `halo` or `style`.** A step's choice wins, then its tour's, then `halo`, so that every tour written before looks exactly as it did.
  - A step keeps either value, since either overrides its tour. A tour's `halo` is the default and is never written, as `glide` is not (ADR 0084).
  - A step's reveals take its emphasis; a reveal has no choice of its own.
  - The core's tour checkers refuse any other value at either level, in the words of their neighbors ("A step's emphasis is "halo", to mark with a halo, or "style", to draw what it marks in its own style."). `update-tour` sets or, with `null`, takes away the tour's; a step's travels with the step, as its other parts do.
  - `playableStep(project, step, tourEmphasis)` resolves it into `PlayableStep.emphasis: 'style'`, absent for a halo.
- **The live protocol stays at 10**, since no build of 10 has shipped: an app of 9 would refuse a tour file that holds `emphasis`, and 10's history in `core/src/protocol.ts` says so.

### `style` draws nothing over what it marks

The canvas draws what a step in its own style marks again, restyled, over the tiles, as it draws the lines the pointer gives their type's color (ADR 0086). Nothing is laid over it; the tiles keep drawing the thing as it is underneath.

- **A relation's line:**
  - twice its width, and never narrower than 3 pixels on screen;
  - in the canvas's emphasis color (`highlight`, at 3:1 or more on the canvas in both themes, as the theme tests check), opaque even where its appearance fades it;
  - its arrowhead 1.5 to 2.5 times larger, about its tip, as the line widens;
  - its dash kept: a dashed «referencia por array» stays dashed, only stronger;
  - its name, when it has one, written bold on a solid back of the caption card's color (the theme's raised surface, new as `captionBack` in the canvas theme), bordered in the emphasis color, so that it reads over the lines it crosses. The name reads at 4.5:1 on that back and the border at 3:1, which the theme tests check. A count badge keeps its pill.
- **It flows.** While the tour plays and motion is not reduced, the line's dash moves from its `from` end toward its `to` end, one period every 600 ms, linear, as marching ants do; a solid line carries a dash of the caption's color, 45 % of its width and 75 % opaque, along it. An undirected line flows from both ends toward its middle, as ADR 0084's lines draw. The pattern is the same repeating texture the tiles dash lines with, moved along the route, so a frame of flow costs one stroke a straight piece.
- **An element's shape:**
  - a stronger border along its own outline (ADR 0066), 3 pixels on screen, in its own stroke color as the theme draws it where that reads at 3:1 on the canvas, and in the emphasis color otherwise;
  - a soft shadow around it, three strokes outside its outline, darker on the dark canvas;
  - no ring, no corners, nothing over its fill, its category's color or its face;
  - as it comes in, one breath: its border widens by 3 pixels and back over 300 ms, then never again, however long the step shows or the camera zooms.
  - Its name is not written again: the drawing defaults already write names in bold (700). A name an appearance writes lighter keeps its weight; writing it again bold over the tile's would draw two texts in one place.
- **A note** takes the same border and shadow, in the emphasis color; **a free arrow** is drawn as a line is.
- **An anchored part of a solid** is left to the solid layer, as with a halo (ADR 0075); it shows no restyle.
- **A pulse** (ADR 0084) on a step in its own style restyles the leg it runs instead of haloing it, and its marker rides on the restyled line, above it.

### When things move

- **The in stage** (ADR 0077) fades what arrives in its own style by its group's opacity, as it fades halos, beside them: what the step before marked already stays at full strength. A line in its own style does not draw from its start (ADR 0084): its flow says which way it runs.
- **Under reduced motion** (ADR 0077's rule, the system's or the person's Motion preference) nothing flows and nothing breathes: the restyle alone, static. The tour sets `styleMoves` on its emphasis only when motion is not reduced.
- **`dimRest`** dims what the step does not mark as before; what is drawn in its own style wins over dimming, as a highlight does, and the restyle is drawn at full strength over the dimmed rest in both themes.

### Within the budget

- Only the marked shapes and lines are drawn again, each time the emphasis, the scale or the theme changes; the emphasis keeps the same lists while they draw the same, as it keeps highlights (A4).
- Each frame, the flow traces only the marked lines whose bounds meet the screen, and asks for another frame only while one flows or a shape breathes. With nothing marked in its own style, the frame does nothing more.

### In the app and for Claude

- **The Tours panel** offers "How its steps mark what they mark" for the tour, A halo or Its own style, and "How it marks what it marks" for each step, As the tour says, A halo or Its own style, each change one action, in Spanish too.
- **Claude's tools** take `emphasis`: `create_tour` and `update_tour` for the tour (`halo` takes it away), `add_tour_step` and `update_tour_step` for a step (`null` lets the step mark as its tour says). `read_tour` says the tour's emphasis, `halo` when it has none, and each step's own. `check_tour` is unchanged: emphasis changes how a step looks, not where its camera goes.
- **The guidance** `highlight` and `focus` keep their halos.

## Considered options

- **A per-mark override**, `marks: [{ "id": …, "emphasis": "style" }]`, as the issue offered. Left out of this round: it changes `marks` from ids to objects, which every reader, the merge driver, the tours' checks and Claude's tools would then read in two shapes, for a need no tour has shown yet. A step can already split its marks over reveals. It can come later as its own ADR.
- **A project-wide default.** A tour is the unit a person builds and plays; one choice per tour, overridden per step, covers the cases asked for without a project setting.
- **Restyling in the tiles**, drawing the marked lines and shapes heavier where they are drawn. It would plan every tile a marked thing crosses again at each step and each reveal, where drawing the few marked things again over the tiles costs nothing to the rest (ADR 0086 chose the same for hover).
- **The relation's own stroke at full opacity in place of the emphasis color.** Its own color may be the neutral line color of the drawing defaults (ADR 0086), or one that reads poorly once dimmed; the emphasis color is the one the theme tests hold at 3:1 on the canvas in both themes, and the line's width and flow already tell it apart.
- **Bold names for elements**, writing each marked shape's name again. Names are already bold by default, and writing a second text over the first would blur it; left as it is.
- **The same rendering for guidance's `highlight` and `focus`.** Later: guidance marks what Claude points at while it explains, often many things at once, and a halo reads there; a choice for it would be a guidance option of its own.

## Consequences

- `schema/src/files.ts` gains `TourEmphasis`, `TourFile.emphasis` and `TourStep.emphasis`, and `tour.schema.json` is regenerated.
- The core's tour commands check `emphasis` at both levels, and `playableStep` resolves it.
- The app's `Emphasis` gains `styled`, the highlighted keys drawn in their own style, and `styleMoves`; `emphasize` holds what is styled apart from what is haloed (`styled`, `styledArriving`), an aggregated relation's ends with it. `canvas/styledMarks.ts` draws them, and the renderer draws them over the tiles and moves them each frame.
- The canvas theme gains `captionBack`, the raised surface the caption card is drawn on.
- ADR 0077's in stage fades halos and what is drawn in its own style alike; its marks, where a step asks for `style`, are superseded by this ADR. ADR 0084's lines that draw from their start apply to halos; a line in its own style flows instead.
- CONTEXT.md gains **Step emphasis**; the guide's Tours section says how to choose it.
