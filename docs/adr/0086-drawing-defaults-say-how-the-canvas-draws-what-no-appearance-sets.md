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

- 2026-11-02, A5.4: **where the Drawing panel lives.** It is a section of the inspector, Drawing, shown with the open view's section while nothing is selected (`shell/drawing/DrawingPanel.tsx`), not a panel of its own. That is where a view's Lines and Rows, its other choices of how it draws, already are; the canvas beside it shows the result as the project changes, and it needs no new place in the shell. A switch above it, "This project" and "This view only", chooses the layer it changes; with no view open, only the project's. Each group of values is a disclosure, closed at first, whose summary counts the values the layer sets.
- 2026-11-02, A5.4: **what each value shows.** The value drawn for the scope: the project's alone, or what the open view is drawn with. A tag says where it comes from: "From Clean" (its preset), "From the project" or "This view's". A value the edited layer sets has a reset; one the layer under it sets is reset in that layer's scope. In the project's scope, a value the open view sets for itself says so, and a view with a preset of its own says that the project's values do not reach it. A number out of its range is refused in place, and an empty number field resets the value.
- 2026-11-02, A5.4: **the commands.** Each change, a value set or reset, a group reset, every value reset, or another preset, is one `set-drawing-defaults` that writes the layer's whole `drawing`, built on the layer as last sent while an earlier change is on its way; `null` when nothing is left. Choosing another preset keeps the values the layer sets. A view's preset select offers "As the project", which removes the view's own preset.
- 2026-11-02, A5.4: **Claude's tools.** `get_drawing { view? }` answers the resolved values (without the arrowhead's geometry, which comes with the preset and no one sets), what the project and the view set, the presets, and what each value may be. `set_drawing { view?, drawing }` replaces what the scope sets, whole, as one action, and answers the same with a pointer to `capture_view`; it leaves ranges and choices to the core, so that a refusal names the value and its range, and keeps unknown keys so that the core names them too. They live in `claude/drawing-defaults-tools.ts`, apart from `drawing-tools.ts`, whose drawings are pictures made from HTML (ADR 0068).
- 2026-11-02, A5.4: **the side panels' collapse buttons.** Each open side panel ends above a band of its own, as tall as a collapsed panel's strip is wide, which holds its collapse button, so that the button never covers the panel's last line, as it covered the start of "Atenuar las demás líneas al seleccionar" in the inspector.
- 2026-11-02 (A5.4, the main session): **`lines.fadeOthers` fades on hover alone.** Fading the lines that do not touch the selection stays the view's `selectionFadesLines` (ADR 0080, section 5), with its own control in the view's section; `lines.fadeOthers` fades the lines that do not touch the shape or line the pointer is on, and A5.2 draws it. The two never fight: with both on, selecting fades as the view says, and pointing fades on top of it. The side panels' collapse button in a band of its own applies to both panels, the model's and the inspector, and values are typed in number fields rather than sliders, so that one change is one action.
