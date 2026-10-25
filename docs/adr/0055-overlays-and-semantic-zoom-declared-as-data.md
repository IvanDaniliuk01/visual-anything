---
status: accepted
---

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions. -->

# Overlays and semantic zoom are declared as data: overlays in views, levels in appearances

M8 adds two ways to read a large model without making new views:
- overlays, which color, size, mark or fade shapes by an attribute (benchmark R12);
- semantic zoom, which shows more or less of a shape as the scale changes (R11).

Both are data, so they need no code (ADR-0012), and both diff cleanly.

## Overlays

- **Where they live.** A view file gains an optional `overlays` list. Each overlay maps one attribute of elements, or of relations, to one channel, so an overlay is part of how a view reads, kept with it.
- **The channels:**
  - `fill`, `stroke`;
  - `size`, a factor from 0.5 to 2 on width and height, which layout ignores;
  - `badge`, a short text;
  - `opacity`.
- **The mappings:**
  - **discrete:** values to colors, sizes or texts, with a color for anything else;
  - **continuous:** a number range to a color ramp or a size range, with stops;
  - **passthrough:** the value is the color or the text.
- **A view's overlays** apply in order, each channel once, the first that sets it winning. One can be turned off without being removed.
- **The legend** is drawn from the overlays: a panel on the canvas, with what each color or size means. It goes into every export (ADR-0041 and M6b) with its own text, so a color is never the only way a meaning is told.
- **Colors** are checked like any stored color (ADR-0033). The legend warns when two colors of one overlay are under 3:1 apart, or under 3:1 against the canvas of the theme shown.
- **Exploring is not stored.** Filters and focus still belong to the open app (ADR-0025). An overlay is stored because it describes the view, like its perspective.

## Semantic zoom

- **Where it lives.** An appearance gains an optional `levels` list. Each level has a `from` scale and what shows from it: a silhouette only, the name, the detail (its attributes and badges), the contents or rows, or the image. Levels sort by `from`, and the highest reached wins.
- **Inheritance.** Levels inherit like any trait of an appearance, so a component sets them once and its elements follow.
- **No flicker.** A level is entered at its `from` scale and left only 10% below it.
- **What the renderer does.** Its own thresholds for names and detail become the defaults that an appearance without levels follows, so nothing changes for projects that set none. Zooming far into a collapsed container may expand it, if its appearance says `expandFrom`, and zooming out collapses it again. Neither is stored, as ADR-0024's collapse is not.
- **The budget holds.** Levels are worked out per tile, not per shape per frame, and a change of level redraws only the tiles that cross it.

## Considered options

- **Overlays in the open app only, like filters:** rejected. "Which services miss their latency budget" is a question a view is made to answer, and the answer should be shared, exported and reviewed in git.
- **Expressions, as MapLibre's `step` and `interpolate`:** rejected for now. Ordered stops cover the cases in benchmark R11 and R12. Code that computes appearances belongs to package code (ADR-0054).

## Consequences

- The schema gains `ViewFile.overlays` and `Appearance.levels`, with their commands and their checks.
- The scene applies overlays and levels. The renderer draws the legend and switches levels by tile, and the benchmark gains phases for both.
- Claude gets tools to read and set a view's overlays.
- CONTEXT.md gains **Overlay**, **Legend** and **Level of detail**.
