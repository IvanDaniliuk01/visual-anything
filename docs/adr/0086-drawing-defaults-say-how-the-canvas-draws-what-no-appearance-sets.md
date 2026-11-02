---
status: accepted
---

<!-- Decided by Claude on 2026-11-02 under the user's standing delegation of design decisions, after the user asked, before going public, for a visual overhaul that is "limpio y sobrio" (clean and restrained, as Linear, Figma or tldraw), over typography, the app's chrome, shapes and containers, and lines, and "que sea todo configurable". Judged on the user's own data model, from a temporary copy that never enters the repository. -->

# Drawing defaults say how the canvas draws what no appearance sets, from a preset a project and a view can change

An appearance (ADR 0034, 0035) says how one definition's or one element's shapes and lines look: their kind, fill, stroke, size, width and dash. Everything else the canvas draws is a constant in code: every line width but a relation's, the arrowhead, the corner radii, the font, its sizes and weights, the padding inside shapes and containers, how a collapsed container and an aggregated relation look, the zoom at which names, details and rows show, and the grid. The SVG export repeats about twenty of them by hand (`export/svg.ts`). None of it can be changed, and seen on a real model it reads heavily:

- lines 2 wide with large filled arrowheads, in a different strong color for each relation type and no legend;
- a database container drawn as a cylinder stretched over the whole view;
- collapsed containers drawn as empty stacked boxes;
- names asked for at weight 600, which is not loaded, so they draw bold;
- light colors a package stored drawn as stored on the dark canvas.

## Drawing defaults

- **Drawing defaults are the values the canvas, the read-only page and every export draw with wherever no appearance sets them.** They come in groups:
  - **lines:** width, arrowhead (kind, length and width), corner radius of rounded routes, gap between parallel lines, the color of lines whose relation type takes a built-in color, and how lines respond to hover and selection;
  - **shapes:** border width, corner radius, shadow, and the fill and stroke of what takes Essence's;
  - **text:** font, the sizes and weights of names, details, rows, container names, relation labels and notes, line height, and the padding of a text block;
  - **containers:** how a container is drawn (as its kind, or as a region with a name tab and its kind's icon), its padding and header, and how a collapsed one shows (a stack, a count, or both);
  - **aggregated relations:** a count label or a count badge, and whether the width grows with the count;
  - **reading:** the zoom levels at which names, details, rows and relation labels show, and the size of names far out;
  - **the grid:** lines or dots.
- **A preset is a named, built-in set of drawing defaults:**
  - **Clean** is the default for every project. It has thin neutral lines with small arrowheads, 1-wide borders, a radius of 8, no shadow, names at 13 in a real semibold, containers as quiet regions with a name tab, collapsed containers with a count, aggregated relations as one line with a count badge, and dots for the grid.
  - **Dense** packs more in: smaller text, tighter padding, rows shown sooner, lines colored by their type.
  - **Expressive** is rounder and bolder: larger radii, colored lines by type, soft shadows, larger names.
  - **High contrast** has thicker lines and borders, darker text, and no faint colors.

  Each preset's values are written in the design (`docs/designs/drawing-defaults.md`) and held by tests: contrast in both themes, and the frame budget at 10,000 elements.
- **Projects and views choose and change them.** A project names a preset and may change any value of it; a view may change any value again, for that view only. Each changes only what it lists, so a later change to a preset reaches every value a project left to it. They are stored in the project file and the view file (`drawing`), because they are part of how the project reads and its exports must draw the same anywhere. Undefined means the preset as built in.
- **An appearance still comes first for what it sets.** A component's, element's, relation type's or relation's own stroke, width or kind wins over the drawing defaults, and so does a stored color, which stays drawn as stored (ADR 0033).
- **Changed by commands, as any project data is:** `set-drawing-defaults` for the project or a view, undoable and recorded with its author. The app edits them in a panel, Drawing, with the preset, each group's values and a preview on the open view. Claude reads them with `get_drawing` and changes them with `set_drawing`; `capture_view` lets it check the result.
- **One module resolves them** (`core/src/drawing.ts`), from the preset, the project and the view, into the values the canvas, the page and the exports read. The constants in `canvas/draw.ts`, `rowsDraw.ts`, `geometry.ts`, `textBlock.ts`, `fit.ts`, `scene.ts`, `renderer.ts` and `export/svg.ts` give way to it, so the SVG no longer repeats them.
- **What a person reads with stays a preference** (ADR 0032): the theme, the language, the grid's visibility. Drawing defaults are not preferences, since two people opening one project must see the same view.

## The app's chrome

The overhaul also takes the app's own panels and toolbars to the Clean look, through the theme tokens (ADR 0033), which stay the one source of the shell's colors, sizes and spaces:

- **one toolbar row** of icon buttons from the one set, grouped, with labels on hover and in the keyboard help, and what does not fit in a More menu;
- **the language and the theme** in one menu at the header's end, rather than a wide select beside the view's name;
- **warnings summed up** in one short notice ("29 warnings · Show"), which opens the list in a panel, rather than each warning written out on the canvas;
- **the page never scrolls as a whole.** Only its panels do.

## Proposed, not built until the user agrees

- **Light stored colors adapted on the dark canvas.** ADR 0033 draws every stored color as stored in both themes, so a pale note or a pink trigger from a package glares on the dark canvas. A drawing default, `storedColorsInDark: "as-stored" | "adapted"`, would let a project ask for its stored colors to be drawn with their lightness turned for the dark theme, with the hue and contrast kept. That contradicts ADR 0033 for projects that ask for it, so it waits for the user's answer, and a new ADR would supersede that part of ADR 0033 if they agree. Until then every stored color is drawn as stored.

## Considered options

- **Keeping the constants and only changing their values to a cleaner look:** rejected. The user asked for everything to be configurable, and one fixed look cannot serve both a 70-table data model and a ten-box overview.
- **Drawing defaults as a person's preference:** rejected. Two people would see one project differently, and exports would depend on who made them.
- **CSS for the canvas:** rejected. The canvas draws with PixiJS (ADR 0014), and a stylesheet engine for it would cost the frame budget. Faces (ADR 0083) already give one component HTML and CSS of its own.
- **Only per view:** rejected. Most projects want one look everywhere, set once.
- **A free-form theme file of tokens:** rejected for now. Presets with values that are checked keep contrast and the frame budget held by tests. A project's own preset could come later.

## Consequences

- `ProjectFile` and `ViewFile` gain `drawing?: DrawingDefaults`. The schema is regenerated, and an older program refuses nothing new, since the field is optional.
- The core gains `core/src/drawing.ts`: the presets, `drawingOf(project, view)`, and the command `set-drawing-defaults` with its checks (ranges and kinds) and property tests.
- CONTEXT.md gains **Drawing defaults** and **Drawing preset**.
- The canvas, the page and the exports read the resolved drawing defaults, and the SVG export stops repeating the canvas's values.
- Clean becomes the look of every project that sets nothing. The built-in packages' samples and the screenshots in the README change with it, and the release notes say so.
- The guidance protocol is unchanged. The Claude tools gain `get_drawing` and `set_drawing`.
- The frame budget holds for every preset, measured with the 10,000-element benchmark.

## Clarifications

<!-- Decided by Claude on 2026-11-02 under the user's standing delegation of design decisions, while building A5.1, "The canvas and exports read drawing defaults". -->

- 2026-11-02 (A5.1, building it): **how the canvas, the page and the exports read drawing defaults.**
  - **One switch point.** `app/src/canvas/drawing.ts` resolves the drawing a project and a view draw with (`canvasDrawing`, `drawingOfView`). A project and a view that name no preset are laid over `DRAWING_BEFORE_A5` (`NO_PRESET`), so that nothing changes look until A5.2 changes that one line to Clean. A project or a view that names a preset starts from it, through the core's `resolveDrawing`. What a project or a view sets takes effect now.
  - **Cached by identity.** The resolved drawing is kept by the project's and the view's `drawing` objects, so resolving costs nothing a frame. A drawing that comes to the base's values, as `{}`, is the base itself (`BASE_DRAWING`).
  - **Carried on the scene.** `Scene.drawingDefaults` holds the drawing a scene was laid out with, absent for the base, so that every scene equal before stays equal. A build with another drawing starts from nothing, so that every shape and line is another object. The renderer then takes a painter of that drawing in the theme shown (`painterOf(theme, drawing)`, one for each theme and drawing) and plans every tile again, near the screen first, within the frame budgets a new view takes. A drawing change so redraws as another view's scene does, never in one frame; a theme switch with any drawing finds its painter made.
  - **Where each group is read:**
    - **lines:** the scene, for a line whose width no appearance sets and for free arrows (`arrowWidthOf`), the arrowhead (`arrowheadAt` through `arrowheadOf`, open or none), rounded corners and the gap between parallel lines; everything that routes a line again keeps the arrowhead and the radius it was made with (`arrowheadAgain`, `cornerRadiusOf`). `color` and `fadeOthers` are read and carried; A5.2 draws them.
    - **shapes:** the painters' borders and radii, a person's a fifth rounder and a table's a fifth tighter than a rounded rectangle's, so that today's 12 and 8 come from 10; the plain blocks' outline, four borders wide; a table's border and the rule under its header. `shadow` is carried for A5.2.
    - **text:** sizes, the name's weight, line height and padding, in the text block (`textBlock.ts`), a table's header and rows (`fit.ts`, `rowShapes.ts`), relation labels, notes and the SVG. The side inset is the padding and 4 (12 for 8). The exports' lines keep their own height, in the ratio of the drawing's line height to the canvas's. `font: system` writes in the system's fonts alone.
    - **containers:** the padding, in the scene, the layout's input (`LayoutInput.padding`) and the engine. `drawn` and `collapsed` are carried for A5.2.
    - **aggregated:** whether a line grows with its count. `count` is carried for A5.2.
    - **reading:** the renderer's levels: names, details, relation labels (a relation's tile is labelled from `labelsFrom`, or where details show sooner for want of shapes), rows (`levelWithRows`) and far names (`farOut`, `placeFarNames`, `FarNames`), at `farNameSize`.
    - **grid:** `look` is carried for A5.2, which draws the dots.
  - **The SVG reads the same values.** Its copies of the canvas's constants are gone. What both share and no drawing default changes (the casing, a relation label's back, a plate's radius, a name's line, the dash patterns) lives in `canvas/drawing.ts`, which imports no PixiJS. The font families live in `canvas/fontFamilies.ts`, which needs no DOM, as the command line writes SVG in Node.
  - **A built-in package's width is an appearance.** The built-in packages give their relation types widths (1.5 in data modeling, 2 in C4), which come first, as this ADR says of every appearance. `lines.width` so reaches lines whose type takes "relates to"'s width, and free arrows. A5.2 must decide whether Clean's thin lines need those packages' widths to yield.
- 2026-11-02 (A5.1): **type.**
  - **Roboto Medium.** Roboto 2.137 Medium joins the canvas's faces and the PDF's, from the same `roboto-fontface` 0.10.0 and license entry (`export/fonts/roboto-medium.json`). The PDF loads it only when the SVG writes a name at 500, which it marks with the family `Visual Anything Roboto Medium` before the drawing's fonts, a family no reader has, so that a browser draws that text at 500 in the drawing's fonts.
  - **No weight that is not loaded is asked for.** Names ask for `nameWeightOf`: 400, 500 or 700. The bitmap labels map a weight to the nearest loaded one, as a browser would, 600 to 700, and a label that names none takes its kind's own font. Under `DRAWING_BEFORE_A5` names are 700, which the 600 they asked for drew as, so the pictures stay as they were. A weight other than the kind's, or another family, takes a bitmap font of its own, installed the first time.
  - **Medium is measured as Bold.** The core holds Roboto's Regular and Bold widths only. A name at 500 is measured in Bold's, which is a little wider, so a name measured to fit fits once drawn. A table of Medium widths in the core would measure it exactly.
  - **Kerning: patched, not turned off.** `patches/pixi.js@8.22.0.patch` fixes `DynamicBitmapFont._applyKerning`. A bitmap text reads, on each glyph, the kerning for the glyph before it (`kerning[previousChar]`), so the pair that was measured twice is the first assignment: `chars[first].kerning[second]` is for `second` then `first`, and now measures `second + first`. The patch costs what the code cost before, a measure for each new pair when a font is installed, and nothing a frame. Placing glyphs by the core's advances, as emphasis does, would make every label a container of pieces, which costs more to make and to draw by the thousand. An issue for PixiJS is still to be filed.
  - **The SVG's fonts.** Its `font-family` names the bundled `Visual Anything Roboto` first, then the system's, and names are written in their real weight (700 under `DRAWING_BEFORE_A5`, not 600).
- 2026-11-02 (A5.1): **a table's rows in columns.** The canvas's own rows of a table, not a face's (ADR 0083), write a column's type in Roboto Mono at `rowSize − 1` in a column of its own, placed against the badges' column at the row's right, and its badges in that column after it. Each type starts at the type column's left edge, one x for every row of its table, so the types line up; the columns are as wide as the table's widest type and badges, within 45 % and 30 % of a row's room. A badge is told by its text among those its appearance gives, at the detail's end. An overlay's badge or a live value on a row writes the row on its one line again, as before. The data-modeling package's columns draw their own face, which keeps its layout.
