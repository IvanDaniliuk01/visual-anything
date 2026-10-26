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

## Clarifications

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions, building W35. -->

- 2026-10-25: **the file format.**
  - `ViewFile.overlays` is a list of at most 16. Each overlay has an `id` of its own in the view, an optional `name` for the legend, `of` (`elements` or `relations`), the `attribute` it reads, its `channel` and its `mapping`, and `off` while it is turned off. The overlay is a union on its channel, so that the schema checks that a mapping fits it: colors for `fill` and `stroke`, factors from 0.5 to 2 for `size`, texts of 1 to 12 characters for `badge`, and opacities from 0.1 to 1 for `opacity`.
  - A discrete mapping has 1 to 64 cases and an optional `otherwise`, which any other value takes, a missing one included. A case's value is text, compared as filters compare, so "12" names 12 and "true" names true; commands take numbers and booleans and keep them as text. A continuous mapping has 2 to 16 stops in increasing order of `at`, and mixes between them; colors are mixed channel by channel. Passthrough takes the value itself, for colors and badges only. Every case and stop can carry a `label` for the legend.
  - A value an overlay maps nothing to leaves the channel to the next overlay, and the shape keeps its own look when none sets it. An overlay reads an element's own value, or its component's default, as filters do; live values (ADR 0057) come in through the same lookup.
  - `Appearance.levels` is a list of at most 8 levels, each a `from` scale from 0 to 8 and what it `shows`: `silhouette` alone, or any of `name`, `detail`, `contents` and `image`. Below the first level a shape shows a silhouette. An empty list follows the canvas's own steps, whatever is inherited, as an empty list of connection points attaches anywhere. `Appearance.expandFrom`, above 0 and at most 8, is the scale from which a collapsed container expands. Both inherit as every trait does, each list whole.
- 2026-10-25: **the commands.** `set-overlays` replaces a view's overlays, as Claude and imports set them; `add-overlay`, `update-overlay` (part by part), `remove-overlays` and `move-overlay` change one at a time, as the inspector does, so that the person and Claude do not undo each other's changes, as ADR 0022 says of definitions. Each changes only the view's file. Refusals use `invalid-overlay` and `unknown-overlay`; an attribute that no definition defines and nothing holds only warns. Commands store levels sorted by `from`, and refuse two levels at one scale and a silhouette with other parts; a file that holds either only warns, and the last level at a scale is used. Colors are written in capitals, but a color the overlay already holds keeps its spelling (ADR 0033).
- 2026-10-25: **how the canvas applies overlays.** The scene applies them after it places its shapes and before it routes relations.
  - **Colors** from an overlay are drawn as stored colors are, in both themes; beside a built-in fill, a stroke under 3:1 on the dark canvas keeps the fill's light value, as ADR 0033 says of stored strokes.
  - **Opacity** fades a shape's colors toward what it sits on, its container's fill or the canvas, in each theme, instead of drawing it translucent: the renderer needs no change, a change of opacity is a recolor, and the name keeps the color that reads on its fill. A line fades toward the canvas.
  - **Size** scales a shape around its middle. Only a shape that shows no contents and is neither a row nor a shape that draws rows takes it. The shape keeps the rectangle layout gave it, as `laidOut`, which layout's input and the drop and snapping maths read, so that changing an overlay never moves anything; what holds a sized shape grows its extent to hold it. On a line, size is a factor on its width.
  - **Badges** are written after the shape's own detail, like the badges an appearance declares, or after a relation's name.
  - Aggregated relations stand for many relations, and take no overlay.
- 2026-10-25: **the legend.** The core describes it (`legendOf`), apart from any renderer, so that the canvas, the PNG and the SVG and PDF writers each draw it their own way. On the canvas it is a disclosure in the bottom right corner. On a PNG it is a band below the image, so that it never covers the drawing. Its warnings about colors are messages of the core, translated by the app's templates, and Claude reads them in the answers of `get_overlays` and `set_overlays`.
- 2026-10-25: **levels on the canvas.** The renderer's own steps stay the defaults: plain blocks below 0.25, names from 0.45, details from 0.9, and rows' texts from 0.7. Shapes that declare levels go in tiles of their own, by their levels (rows by their container's), so that every shape of a tile changes level at once. Such a tile works its level out from the scale with the 10% hysteresis, and shows plain blocks for a silhouette, its names for `name`, names and details for `detail`, rows' texts for `contents`, and pictures for `image`, as the canvas's own rules show them. A level can thus show names far out, below 0.25. Tiles of shapes that declare no levels follow the canvas's own steps exactly as before, without hysteresis, so that nothing changes for projects that set none.
- 2026-10-25: **expanding by zoom lives only in the open app, and is never stored, as filters are not.** `ViewFile.collapsed` stays the stored collapse. A collapsed container whose appearance says `expandFrom` shows expanded once the zoom reaches that scale while it is on screen, and collapses again only once the zoom falls below 90% of it, wherever the canvas looks. Collapsing such a container by hand collapses it again through the zoom alone, sending no command, and it stays collapsed until the zoom falls below where it expanded. Laying out contents that never had positions, when such a container first expands, is stored, as it is when a container is expanded by hand.
- 2026-10-25: **Claude's tools.** `get_overlays` reads a view's overlays with their legend and its warnings in both themes, `set_overlays` replaces them, and `set_levels` gives a component, built in or the project's own, its levels and its `expandFrom`, through `set-component-appearance`.

<!-- Decided by Claude on 2026-10-25 under the user's standing delegation of design decisions, building W41. -->

- 2026-10-25: **the legend in every export.**
  - The PNG, the SVG and the PDF carry the same legend, laid out once (`app/src/export/legendLayout.ts`, pure, as the SVG writer is): a band below the drawing, never over it, with each overlay's title, what it changes by which attribute, each entry's swatch and words, and then its warnings about colors. The warnings are the core's messages, translated by the app's templates as the canvas's panel translates them, and written in the theme's warning color; the PNG's band writes them too since this clarification.
  - The SVG's view box grows down by the band, and the band is at least 320 canvas units wide: a narrower drawing is widened on the canvas's color, and a PNG likewise, 320 pixels of the screen at its scale. The legend is written at the canvas's text sizes, a canvas unit to a pixel, so it reads where the shapes' names do. Its texts are SVG text, so the PDF writes them as text in its embedded fonts, which can be selected, searched and read aloud. The legend is `g[data-part="legend"]`, in front of everything, with a group for each overlay, `data-overlay` its id; the drawing reports where it lies (`SvgDrawing.legend`).
  - The outline in Markdown has a **Legend** section, after the notes and before the scenarios: each overlay that is on, under its title, what it changes by which attribute, and each case and stop with what it gives, colors as `#RRGGBB` in code. It says nothing of contrast, which only a drawing shows.
  - Mermaid and Structurizr hand drawing to other tools, which draw no legend; while an overlay is on, each says among what it lost that the outline, the SVG and the PDF carry the legend.
- 2026-10-25: **playback follows the zoom.** Scenario playback reads the view as the canvas draws it: a collapsed container the zoom expands plays expanded, so the steps inside it play one by one, each highlighted on its own line with its marker, and the step panel brings them into sight there; once the zoom collapses it again, they play again as one aggregated step on it. The view's file is left as it is: the timeline and the emphasis read a copy of the view without the containers the zoom expands (`viewAsDrawn`). The step playback is on stays the same step of the scenario across the change.
- 2026-10-25: **levels in the component editor.** A component's levels of detail and `expandFrom` are edited in its own section of the component editor, Levels of detail, at the level the project can change, as colors are: one `set-component-appearance` for each change, so a built-in component's go into the project file. Each level shows the zoom it starts at as a percent, as the canvas's toolbar says the zoom, and what it shows as checkboxes. A silhouette excludes the other parts: checking it leaves it alone, checking another part takes its place, and a level left showing nothing shows a silhouette. A new level starts at twice the zoom of the highest, at most 800%, showing what that one shows and the detail; the first shows names from 45%, where the canvas starts writing them. Removing every level, or Follow the canvas's defaults, stores an empty list, and Use the inherited value takes the list out. An empty zoom to expand from takes it out; nothing stores "never", since a value inherited from the component derived from can only be replaced by another.

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

- 2026-10-26 (W49): **Fit prefers a zoom where names draw.** Dogfooding found Fit choosing 17% for a nested view of 84 shapes, where the canvas writes no names, so the person saw blank boxes. Fit, by the toolbar, the key 0 and when a view first shows with no camera of its own, still shows the whole view when names draw at the zoom that fits it, from the canvas's own 45% up (`NAMES_FROM`). When the whole would draw none, it fits less than the whole: it keeps to 45%, and shows the view from its top left corner, where its top level begins, with the margin left of and above it, centred along a side that fits whole (`readableFitCamera` in `canvas/camera.ts`); the person goes in from there, zooming or with the keys. The read-only page's Fit is the same, and a tour's step that names neither a camera nor a selection shows what Fit shows, for ADR 0058's "the whole view". Zooming out still reaches the whole view, and the benchmark, which measures the whole view far out, fits it whole (`fitWhole`, and `firstFit: 'whole'` for its first frame). Names start where the view's shapes write them: for a shape that declares levels, at the lowest of them that shows its name or its detail, and for one that declares none at the canvas's own 45%; Fit keeps to the least of these (`namesFromOf` in `canvas/levels.ts`), so that a view whose containers write their names from 10% is fitted whole wherever the whole fits at 10% or more. Considered: fitting the whole view and drawing names smaller than the canvas writes them, rejected, since a name a few pixels high is not read either; fitting the first shape of the top level, rejected, since one shape at the scale that fits it often hides its neighbours, the shapes it relates to.
