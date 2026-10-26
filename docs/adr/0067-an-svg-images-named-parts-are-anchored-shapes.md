---
status: accepted
---

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

# An SVG image's named parts are drawn as the shapes of the elements anchored to them

Anatomical atlases, maps, plans and machine drawings already exist as SVG whose pieces carry ids. HRA, the Allen atlases and EBI's anatomograms are examples (first benchmark, R10). Drawing those pieces as the shapes of elements links a drawing people already trust to the model, so that it can be selected, focused, related, colored by an overlay and played through. Images are package data, cleaned in the core (ADR 0027), and free geometry gives shapes outlines of their own (ADR 0066). This decision joins the two.

## Decision

### Named parts

- **What a named part is.** A named part of an SVG image is an element of its cleaned view that has an `id`: a shape, a group, a `use` or a nested `svg`. Elements inside the image's definitions, clip paths, masks and gradients are never named parts.
  - Its id is its name. The cleaner already keeps only ids of the form `[A-Za-z_][\w.-]{0,63}`.
  - A part holds what its element draws, everything inside it included, so parts can nest.
- **Its outline** is made of:
  - what the part fills, by its own fill rule;
  - what it strokes, as a band of its stroke's width.

  Transforms are applied and `use` is resolved, in the image's own units. The outline uses ADR 0066's type, which holds stroked lines beside filled contours.
- **Its main color** is the fill of its largest filled shape. For a gradient, it is the gradient's middle stop.
- **The core reads parts only from the cleaned view**, with the cleaner's own strict reader, and never from the stored text.
  - `partsOf(cleaned)` lists the parts in document order, with their outlines, bounds and main colors.
  - `partPicture(cleaned, id)` writes a picture of one part alone, as follows:
    1. The part's element is placed inside copies of its ancestors that keep only their transforms and paint.
    2. The definitions the part refers to come with it.
    3. They sit in an `svg` whose view box is the part's bounds.
    4. The result is cleaned again, so that it is exactly what cleaning gives.
  - `geometryOf(cleaned, id?)` writes a part's outline, or the whole picture's, as free geometry within ADR 0066's caps, simplified to fit. The component editor and Claude use it to copy an outline.
  - All three are cached by the cleaned view, as cleaned images are.
- **Caps.**
  - A picture has at most 1,024 parts, in document order; beyond that, opening and the action's answer warn with `too-many-parts`.
  - Each part's outline is flattened to at most 4,096 points and simplified beyond that.
  - The image's own caps (ADR 0027) bound all of this work.

### Anchoring an element to a part

- **An appearance gains `part`.** It is either `{ "part": "<id>", "image": "<image id>" }`, the named part its shapes are drawn as, or `none`.
  - `image` may be left out. The part is then found in whatever image the element's container shows with its parts.
  - It inherits as every trait does. A component "Left ventricle" can therefore be drawn as part `lv` wherever its elements sit in a drawing of a heart, from whichever picture of a heart, as long as that picture names a part `lv`.
- **An image's placement gains `parts`.** A shape that shows its image with its parts is a drawing with parts:
  - it writes its name in its header, as a container does;
  - it draws the picture under the header, filling its body and keeping the picture's proportions.

  The picture is drawn at one canvas unit per unit of the image, scaled down to fit 1,600 a side, unless the view stores the shape's size; then the picture fits the body of that size.
- **Its contents** take one of two places:
  - a content whose appearance names one of the picture's parts, with this image or with none, is an anchored part. It is drawn in its part's place, at its part's size, and has no position or size of its own in the view, as rows have none (ADR 0023);
  - its other contents are placed below the picture.
- **One content per part.** A part is drawn by at most one content: the first in the model's order. Another content naming the same part is placed as an ordinary content, and the inspector says why.
- **Drawing order.** Anchored parts are drawn in the order of their parts in the picture, in front of it, whatever the stacking order, as rows follow the model's order. Pointing finds the last one that holds the point.
- **Its own contents.** An anchored part draws none of its own contents, which the outline lists, as a row does.
- **Outside a drawing with parts**, in another container or directly in World, a shape whose appearance names a part of a given image is drawn on its own:
  - its outline is the part's, as its free geometry, keeping proportions;
  - inside the outline, it draws the part's picture.

  Without `image`, or when that image has no such part, it is drawn as its kind, or by its free geometry.

### How the canvas draws a drawing with parts

- **One picture.** The picture is drawn whole, once, as any picture is (ADR 0027): one texture for each image, not one for each part.
- **Each anchored part is its outline over the picture.** It is pointed at, selected, hovered, focused, highlighted by playback and guidance, related and announced as its element's shape, and its marks are drawn along the outline. What changes how a part looks is drawn over its place:
  - an overlay's fill fills the outline in that color; its stroke strokes the outline; its badge is written at the part's label point; its opacity lays a veil of the drawing's fill over the part;
  - a part drawn faintly, by focus or as the container of what a filter shows, gets a veil over it. A part a filter hides is covered with the drawing's fill, opaque;
  - a part drawn at full strength in a drawing drawn faintly is drawn with its own picture (`partPicture`). That picture is rasterized when it is first needed, and until then the outline is filled in the part's main color.
- **Far out**, where pictures do not show, each anchored part is drawn as its simplified outline, filled in its main color.
- **Names.** A part writes its name in its label area when the name fits, by ADR 0066's rule, and writes none otherwise. The hover and selection marks then write it beside the part.
- **Levels of detail.** Anchored parts take their drawing's levels, as rows take their container's (ADR 0055).
- **Gestures.**
  - Pressing an anchored part selects it.
  - Dragging it drags its drawing with parts, as pressing a picture's name band does, since a part's place is the drawing's.
  - It leaves its container only from the shape menu or the inspector, never by being dragged clear.
- **Keyboard and outline.** Keyboard navigation and the outline list anchored parts in their picture's order.

### Relations and layout

- **Relations attach on a part's outline** as they do on free geometry:
  - at its appearance's connection points, carried in from the sides of the part's bounds;
  - otherwise, where the line from its inner point last leaves the outline;
  - a part that only strokes, such as a nerve drawn as a line, attaches at the point of its line nearest the other end.
- **Layout** treats a drawing with parts as one block, as it treats a shape that draws rows. Its size comes from its header, its picture and its other contents. It has a port for each related part, on the side of the block nearest that part (ADR 0015).

### Anchoring from the app and by Claude

- **The inspector of a drawing with parts** lists its picture's named parts, with previews, and which content each one is drawn as.
- **Anchor parts…** matches parts to contents in one of three ways:
  - by name;
  - by id;
  - by an external identifier (ADR 0056): the part's id read in a scheme the person picks, translated through a crosswalk of the project's packages when the contents use another scheme.

  For each part that matches nothing, it offers to create an element inside the drawing, named after the part, of a component the person chooses. Everything is one undoable action: `Anchor 12 parts of "Heart"`.
- **Claude** has two tools:
  - `list_image_parts`: the parts' ids, bounds and main colors, and which elements are drawn as each, in which views;
  - `anchor_parts`: what the dialog does, in one action labelled Claude.

### When the picture changes

- **Replacing an image's content** keeps every anchor. This covers `define-image` on the same id, and Replace image….
  - Anchored parts follow the parts that keep their ids, to their new places and outlines.
  - Nothing is stored about a part's place, so no view file changes.
- **A part that the new content lacks.**
  - The anchor is kept and ignored, as ADR 0039 keeps bend points.
  - The element is drawn as an ordinary content, which layout places as a new shape (ADR 0015, ADR 0065).
  - The action's answer and opening warn with `unknown-part`.
  - Bringing the part back, or undoing, anchors it again.
- **Before a replacement applies,** the replace dialog and `replace_image`'s answer list the anchored parts that the new content would lose, with the elements drawn as them. A replacement is never refused for this.
- **Removing the image** is refused while an appearance names it (`in-use`, ADR 0027), in `part.image` too.

### What keeps it safe

- **Parts are read from the cleaned view only**, and their ids are the cleaner's.
- **A part's picture is new SVG**, written from the cleaned tree and cleaned again. The browser therefore only ever decodes canonical cleaned SVG, and only as a picture (ADR 0027).
- **Outlines reach PixiJS as numbers**, never as markup.
- **Part ids are data.** Claude reads them as ids. The cleaner drops text, titles and descriptions, so a picture carries no words beyond its ids, which are at most 64 characters of a narrow class.
- **Caps bound the work**: the image's own caps, the cap on parts and the cap on flattening.

## Considered options

- **Parts copied out of the picture into the project as free geometry, on import**: rejected. Two copies of one drawing drift apart, a replaced picture would leave its copies behind, and the package would carry each outline twice. Copying an outline stays possible, on purpose, through `geometryOf`.
- **The drawing's appearance mapping part ids to element ids**: rejected. Appearances belong to components, which packages share between projects, while element ids belong to one model. The element, or its component, naming its part travels with it.
- **Anchoring only through external identifiers, as HRA's crosswalks do**: rejected as the only way. Most SVG files carry ids that are names, so crosswalks are offered as one way to match.
- **Each anchored part drawn as its own picture**: rejected. A thousand parts would be a thousand textures, rasterized one a frame (ADR 0027's budget), and overlapping parts would have to be cut apart. One picture with outlines over it draws a whole drawing at once, and a part's own picture is kept for the one case that needs it.
- **Parts drawn as vectors in their own colors only**: rejected. Gradients, clips and masks, which atlases use for shading, would be lost.
- **Dragging a part freely inside its drawing**: rejected. Its place is the drawing's, and dragging it clear would take its element out of its container by accident, changing the model.
- **An element without an id becoming a part by where it sits**: rejected. Nothing names it, so nothing would survive a replacement.

## Consequences

- The schema gains `Appearance.part` and the placement `parts`, and the schemas are regenerated. The format stays at version 1, and the live protocol's version goes up.
- The core gains `core/src/images/parts.ts`, with `partsOf`, `partPicture`, `geometryOf` and their caps, the check behind `unknown-part` and `too-many-parts`, and the lost parts in the replace preview. Its tests include property tests that every part picture is clean, and ADR 0027's attack corpus.
- The scene places anchored parts. The renderer draws drawings with parts, the veils and the marks of parts, and its image store holds parts' own pictures.
- The inspector gains the parts of a drawing and Anchor parts…, and Claude gains `list_image_parts` and `anchor_parts`.
- The SVG writer draws a drawing with parts as its picture, with what changes how its parts look drawn over it. The read-only page draws them as the canvas does.
- CONTEXT.md gains **Named part**, **Anchored part** and **Drawing with parts**, and **Image** says that a picture can show its parts.

## Clarifications

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

- 2026-10-26 (M8b, Seam 2): **how the core reads a named part.**
  - **A named part draws something.** An element with an id that fills and strokes nothing is not listed: empty, `display="none"`, hidden by `visibility`, of no size, painted `none`, flattened to nothing by a transform, or left out by a cap. An appearance that names it warns `unknown-part`.
  - **Its outline is in the image's own units, measured from the top left of its view box**, in a box the size of the view box that keeps its proportions. Fitted to the rectangle the picture is drawn in, it lies over the picture. Its bounds include its strokes' bands.
  - **The outline is what the shapes fill and stroke, and nothing cuts it.** Clip paths, masks and nested viewports do not cut it, and opacity does not thin it. A fill painted `transparent` still counts, as it does for pointing in SVG. The outermost element's transform applies in its user space.
  - **Strokes are bands with round ends and joins**, whatever their caps and joins.
  - **Its main color** is the fill of its largest filled shape, by area, among the fills that show.
    - A gradient's middle stop is the one at index ⌊(n − 1) / 2⌋ of its stops, its own or those of the gradient it refers to.
    - A fill whose color has no alpha left, such as `transparent`, and a stop of no opacity show nothing.
    - A part whose fills show nothing takes the stroke of its largest stroked shape, and black when nothing shows at all.
- 2026-10-26 (M8b, Seam 2): **the caps on parts.**
  - **Points** are counted with the outline flattened to a quarter unit of the picture drawn 1,600 units on its longer side. Past 4,096, the part's contours are flattened and simplified together into straight pieces, by Visvalingam and Whyatt's method, with one threshold for all of them.
  - **A cap is added on the work of reading**: at most 100,000 segments of shapes are read in all, each `use` reading its own copy. A picture's own 64 KiB of text holds about 20,000, so only a `use` drawn over and over reaches it. Past it, the shapes that follow in document order are left out of every outline.
  - **A shape whose coordinates, transformed, reach past 10⁹ units** is left out of every outline too.
  - **At most 256 closed contours of one shape are classed** as fills and holes, since classing costs the square of their number. They are counted before any is classed; past 256, the largest by their bounds are kept and the rest left out of every outline. A shape is classed once, in its own coordinates, for each viewport size and fill rule, however many times a `use` draws it, since an affine map keeps what holds what. A `use` then costs only the contours kept.
  - **What the caps left out is reported.** `partsLeftOut` gives the contours left out and whether the cap on segments was passed. `too-many-parts` warns on open for a picture past any cap on parts, not only the one on their number. Whether a picture can reach a cap at all is told first from one pass over its text: its ids, a `use`, or path data with more than 256 subpaths.
- 2026-10-26 (M8b, Seam 2, after a security review): **the caps on writing a part as free geometry**, whose union of fills and bands is bounded whatever the picture (`UNION_CAPS` in `core/src/geometry/union.ts`).
  - **Edges.** At most 16,384 edges are joined, counted before anything is built, a stroke's band counting 12 edges for each point of its line. Past that, the flattened contours and lines are simplified together to fit.
  - **The grid.** Each edge is kept only in the cells it crosses, walked from cell to cell as a digital differential analyser does, never in every cell of its bounds.
  - **Crossings and work.** At most 16,384 crossings are found, each once, in the cell that holds it, and at most 4,000,000 steps are spent in all: cells an edge is kept in, pairs of edges compared, cells and edges a ray meets, and pieces joined into loops.
  - **Past a cap,** the union is given up, and the part is written as it is, its contours flattened and each band as one ring around its line. That is linear work, though shapes that overlap then read as their difference where they overlap.
- 2026-10-26 (M8b, Seam 2): **a part's own picture.**
  - It is a cleaned image of its own. Its id is `<image id>#<part id>`, its name the part's id, and it keeps the image's source and license.
  - The outermost element's paint goes on the new `svg`, and its transform before the first copy's own.
  - The copy of a nested `svg` ancestor keeps where its viewport is, which is its transform.
  - A part that reaches past the picture's edge, or that measures lengths on a viewport (percentages, a nested `svg`, a `symbol` or a `use`), sits in a nested `svg` that is the original's viewport, which also cuts it where the picture does. When that would nest it deeper than cleaning allows, the nested `svg` is left out.
- 2026-10-26 (M8b, Seam 2): **a part's outline as free geometry**, as `geometryOf` writes it.
  - Its box is the part's bounds in the image's units, scaled only when they are past free geometry's 100,000 or below 1. It keeps proportions.
  - Free geometry reads all its contours by the even-odd rule, so the part is written as the boundary of what it covers:
    - its contours as they are, curves and all, when no two of them cross, leaving out those that bound nothing (a shape wholly under another) and writing once those that lie on one another;
    - otherwise, and for strokes, whose bands become polygons, the loops around what its fills and bands cover together, flattened to 1/2,000 of the part's size.
  - At most its 64 largest contours are written, simplified together to 2,000 segments and 32 KiB, with numbers rounded to about 1/20,000 of its box.
- 2026-10-26 (M8b, Seam 2): **lost parts, checks and caching.**
  - The anchored parts a replacement loses are those that the picture before lists and the one after does not.
  - `too-many-parts` is warned on open for every SVG image drawn that is past a cap on parts: more than 1,024 named parts, or contours or shapes left out of its outlines.
  - The functions the appearance checks call take a `part` as `{ part, image? }`: `findPart`; `unknownPartProblem`, which gives no warning when no image is named or the image is not drawn, since other warnings cover those; and `partImageId`, which `in-use` adds to the images an appearance names.
  - A reading is kept for each cleaned view's text, so that equal content is read once, and pruned with the cleaned images. Each part's picture is kept for each cleaned image.
- 2026-10-26 (M8b, Seam 2): **which images an element names its part in, and when the checks speak.**
  - A `part` without `image` is looked for in the images that the element's containers show with their parts, under every nesting relation type, as the model holds them; a view shows the anchor only in the drawings it nests the element in.
  - A part an element sets itself, or finds in a container's image, warns `unknown-part` for that element. A part a component names together with its image warns once, for the component, however many elements it has.
  - A `part` whose `image` no package in use defines is refused by every command, with `unknown-image`, as a shown image is. Opening warns of one with `unknown-image`, and the shape is drawn as an ordinary one.
  - An action's answer carries only the `unknown-part` warnings it brings, not those the project already had, so that undoing and bringing a part back say nothing. `define-image`'s answer carries `too-many-parts` for the picture it stores.
  - `too-many-parts` says one sentence for each cap the picture passes, so that each can be translated (ADR 0038).
  - `partsLostByReplacing(project, image, next)` lists what a replacement would lose, part by part with the elements drawn as each. The replace dialog shows it before the replacement applies, and `replace_image`'s answer carries it.
- 2026-10-26 (M8b, Seam 3): **drawings with parts in the scene.**
  - A drawing with parts carries `picture`, where it draws its picture and at what scale, and its image is placed as `parts`, drawn at that place with no plate. It is still pointed at by its whole rectangle, as a container is.
  - Its picture sits under its header, inset as a container's contents are. With a stored size too small for it, the picture is at least one unit across, and the drawing grows to hold what it holds.
  - Its contents keep the model's order in the scene's shapes, as every container's do. The drawing order puts its anchored parts first, in its picture's order, then its other contents in the stacking order.
  - An anchored part carries `part` with `inDrawing`, its outline, and `undrawn` for what it holds. A position the view stores for it is kept and not used, and an overlay's size does not apply to it.
  - A part drawn on its own carries `part` without `inDrawing`, and its outline is fitted so that the part's bounds fill its shape, its proportions kept.
- 2026-10-26 (M8b, W54): **how Anchor parts… matches** (`core/src/images/anchoring.ts`, which the dialog and Claude's `anchor_parts` share).
  - **A drawing's parts and contents.** Its contents are the `from` ends of the nesting relations that end on it, of the open view's nesting relation types, or of any without a view, in the model's order. A part is drawn as the first of them whose appearance names it, with this image or with none, as the canvas places it; a later content naming the same part is a twin, placed below the picture, and the inspector says which part it names and which content has it.
  - **What is matched.** The parts that no content is drawn as, in document order, each to the first content in the model's order that no part before it took and that is not drawn as a part of this picture already: a part and a content are paired at most once, and a content drawn as a part keeps it.
  - **By name**, the part's id and the content's name read alike when, without accents and in lowercase, split at spaces, `_`, `-`, `.`, `:`, `/` and where a lowercase letter or a digit meets a capital, they give the same words: `left_ventricle`, `LeftVentricle` and "Left ventricle". **By id**, the part's id and the element's id are equal. **By an external identifier**, the part's id is read in the scheme chosen, as it is and, when it holds a `_` and no `:`, with its first `_` read as `:` (SVG ids hold no colon, so `UBERON_0002084` is `UBERON:0002084`); the part's identifiers and each content's own are completed through the crosswalks of the packages in use, forwards and backwards as importers complete them (ADR 0056), and they match when they share an identifier in one scheme.
  - **Creating.** With a component chosen, each part that still matches nothing gets an element of it, named after the part's words, the first capitalized, the others in lowercase but for those written all in capitals (`left_ventricle` gives "Left ventricle", `UBERON_0002084` "UBERON 0002084"), and, matching by an external identifier, the identifier in that scheme its id reads as: the form with `:` for an id of letters, `_` and then a digit, otherwise the id as it is. It goes inside the drawing through the nesting relation type `nestingTypeFor` chooses in the open view, or, without one, in the first view that stores where the drawing sits, or else the project's first; in a project with no view, the type of the drawing's other contents. When that view does not nest by it yet, the same action makes it. With nothing to nest it by, the plan is refused.
  - **The action** draws each content matched as its part by its own appearance's `part`, without `image`, so that it follows whichever picture its drawing shows. It is one batch, `Anchor 12 parts of "Heart"`, or `Anchor 1 part of "Heart"`; a plan that anchors nothing sends nothing. Refusals reuse the core's codes: `unknown-element`, `unknown-view`, `invalid-command` for an element that is no drawing with parts, `invalid-external-id` for a scheme that is not one, `unknown-part` for a part asked for that the picture lacks, `unknown-component` and `not-nesting`.
- 2026-10-26 (M8b, W54): **the inspector, Replace the picture… and Claude's tools.**
  - **The parts of a drawing** are a section of the inspector of an element that shows an SVG image with its parts: how many named parts its picture has and how many are drawn as contents, then each part, its first 50 until all are asked for, with a 24-pixel preview of its own picture, its id, and the content drawn as it, which selects that content, or "Nothing is drawn as it". **Anchor parts…** opens a modal dialog whose plan the core works out again as each choice changes: how parts are matched (the scheme among those the project's elements and crosswalks use, or typed), and whether to create an element of a chosen component, at first that of the drawing's contents. It lists the first 8 matches and creations, says how many parts keep their content and how many match nothing, and its button says how many parts it anchors.
  - **Replace the picture…** is offered in the image controls (the component editor's and the element's) for an image of one of the project's own packages. The file is cleaned first; when the new picture lacks anchored parts, a modal dialog lists them, the first 8, each with the elements drawn as it, and the replacement applies only once confirmed; otherwise it applies at once. It is `define-image` on the same id, keeping the image's name, source and license.
  - **`list_image_parts`** takes an image's id or a drawing with parts and, optionally, a view; it gives the picture's size and each part's id, bounds rounded to a hundredth, main color and the elements drawn as it, with each view where each is anchored, and in which drawing, or drawn on its own. **`anchor_parts`** takes the drawing, `by`, the `scheme` for `external`, the `view`, the component to `create` and the `parts`; its answer lists what it matched, created, kept and left unmatched, and when nothing matched it records nothing.
- 2026-10-26 (M8b, W54): **anchored parts on the canvas.**
  - **The part layer** (`canvas/partsDraw.ts`) draws what goes over anchored parts, between the element shapes and package code's drawings, so above every element shape: a shape of World lying over a drawing with parts lies under its parts' marks, which views seldom draw, and the tiles stay free of what depends on another shape's emphasis.
  - **Over the picture**, in the picture's order: a part a filter hides is covered with its drawing's fill, or, in a faint drawing, that fill faded at the faint alpha toward what lies behind the drawing; a faint part in a drawing at full strength gets a veil of the drawing's fill, of one less the faint alpha; a part at full strength in a faint drawing draws its own picture over its place, filled in its main color until that picture is ready; an overlay's fill fills the outline, faint as the part is, its opacity then lays a veil of the drawing's fill of one less that opacity, and its stroke strokes every contour two units wide. An overlay's badge is written at the part's label point, under the lines of its name when it writes one, from the scale names are written at, in the text that reads on the part's main color over a halo of it.
  - **Levels.** Anchored parts take their drawing's levels of detail (`decorate.ts`), as rows take their container's. Far out, where the drawing is a plain block, the tiles draw each part as its simplified outline in its main color (W52). At the middle levels, where the drawing is drawn in full but its picture does not show, the part layer fills each part's whole outline, its holes cut, in its overlay's fill or its main color.
  - **Names.** An anchored part writes its name, and nothing else, only when the name fits whole in its label area: its words, each whole and never cut, as many on a line as fit the area's width less two units a side by the canvas's estimate of their width, the lines 17.5 units apart and within the area's height. Otherwise the hover and selection marks write it beside the part, as they do for any shape whose outline holds no name. Its component's name and its detail are never written in it.
  - **A part drawn on its own** draws its part's own picture inside its outline, the part's bounds fitted to its shape, its proportions kept, over the main color W52 fills it with, through its tile's image drawing.
  - **Gestures and keys.** Pressing an anchored part finds it, the last shape drawn that holds the point; moving it moves its drawing, as moving a row moves its table, so it leaves its container only from the shape menu or the inspector. From an anchored part, Right and Down select the next part of its drawing in the picture's order, Left and Up the one before, and past the last or the first the keys go on as among shapes; Alt+Down on a drawing with parts selects its first part. The outline lists a drawing's anchored parts first, in its picture's order, then its other contents in the model's order.
- 2026-10-26 (M8b, W54, after the user looked at "The heart"): **pictures of drawings with parts are drawn sharp**, which clarifies ADR 0027's image store too.
  - The picture of a drawing with parts and a part's own picture are *large pictures*: their textures may be made at 1,024 and 2,048 pixels besides the 16 to 512 every picture has, the bucket chosen as for any picture, among all eight.
  - A large bucket is taken only while the bytes of the textures in use, atlas pages included, and the new one fit the 64 MiB GPU budget; otherwise the largest that fits, down to 512.
  - Once the camera has rested, and while no theme switch or recolor is being drawn, a large picture is rasterized even when that should take longer than the 16 ms a frame keeps to, up to 250 ms, alone in its frame and only when that frame has spent at most 4 ms; it climbs there bucket by bucket, each step's cost measured, as any picture does. During motion it is rasterized only at a cost known to fit the frame, as any picture is. Every other picture keeps to 512 pixels and to the frame's budget, as before.
