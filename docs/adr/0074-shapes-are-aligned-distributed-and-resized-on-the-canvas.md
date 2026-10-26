---
status: accepted
---

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

# Shapes are aligned, distributed and resized on the canvas

The user asked for "two components at the same horizontal and vertical level", and for shapes that grow and shrink diagonally, vertically or horizontally. Until now a shape's size changed only in the inspector's size fields, shapes lined up only by eye or by the grid, and the spec listed alignment guides as Later. This ADR brings them into the canvas, beside M8b (W51). It settles:

- which shapes take a size by hand, and how a handle dragged resizes them;
- how the selection is aligned, distributed and sized alike;
- the alignment guides that a drag and a resize snap to;
- the keys, and Claude's tool.

## Resize handles

- **Which shapes show them.** A shape selected alone that can take a size, or a note selected alone, shows eight handles, at 8 pixels on screen whatever the zoom: the four corners resize both ways, the middles of the sides one way.
  - A shape drawn as rows (a table) resizes its width only, and shows only the handles on its left and right sides: its height comes from its rows (ADR 0023).
  - A row, an anchored part in a drawing (ADR 0067), a collapsed container (ADR 0024) and a shape an overlay sizes (ADR 0055) show none: the first two have no size of their own, the third is drawn at its component's size, and the last is drawn at another size than it is stored at. The inspector's size fields stay for every shape that has one.
  - On a side shorter than three handles on screen, its middle handle is left out; a shape smaller than 8 pixels on screen shows none, so that it can still be dragged.
  - The handles are hit before the relate handle and the shape itself, within 6 pixels of the screen, corners first.
- **How a handle resizes.**
  - The sides the handle does not hold stay where they are.
  - **Shift** keeps the shape's proportions. From a corner, the axis the pointer changes the most drives the other; from a side, the other axis grows or shrinks around its middle. A shape whose free geometry keeps its proportions (ADR 0066), or that is a part drawn on its own, keeps them unless Shift is held.
  - **Alt** resizes from the middle: the opposite sides move the other way as far. In a resize Alt does not place freely, as it does in a move.
  - **Snapping.** A side that moves lands first on an alignment guide within reach, and otherwise, while the grid shows and snapping is on, on a grid line of the container's shape the shape sits in, as a moved shape's corner does (A3). So sizes and places land on the grid when the sides that stay were on it.
  - **Minimums.** No side goes below 16 canvas units, and a container never below the box around what it holds: the extents of what sits directly in it, rows and anchored parts aside. A side that moves is rounded outwards to a whole unit, so that it cuts nothing it holds.
- **A container keeps its contents in place.** When a resize moves a container's top left corner, what sits directly in it keeps its place on the canvas: the same action stores the place of each of those shapes from the new corner, pinned when it was pinned and unpinned otherwise, a shape the stand-in row placed included. The bend points kept relative to it (ADR 0039), of the lines drawn inside that copy, are moved back the same way. Copies of a container share their contents' places (ADR 0019), so another copy of it, whose corner did not move, draws them shifted.
- **Outlines and drawings.** The handles sit on the shape's box, also for a shape with its own outline (ADR 0066), whose ghost follows that outline fitted to the new size, as its marks follow it. A drawing with parts stores the size it is given, and its picture fits the body of that size, so its anchored parts grow and shrink with it; it never gets smaller than what sits below its picture. An anchored part shows no handles: pressing it drags its drawing.
- **One action.** While a handle is dragged, a ghost shows where the shape would be, with its handles, and the caption beside the pointer gives its size, `184 × 80`. Letting go stores the size and the place with `set-positions`, pinned, as one undoable action labelled `Resize "Booking agent"`; a note's goes with `update-free-shape`, labelled `Resize a note`. Nothing is sent when nothing changed. Escape while dragging cancels. The ghost stays until the change comes back, so the old size never shows in between.

## Align and distribute

- **Which shapes take part.** The element shapes a drag of the selection would move: a row stands for its table and an anchored part for its drawing, which pressing it drags (ADR 0067), and a shape inside another that takes part goes with it; and the selected notes and free arrows. Sizing alike takes only the shapes that take that size, and notes; arrows take no size.
- **The ways,** each against the bounds of the shapes that take part, on the canvas:
  - **Align left, Align centers (on a vertical axis), Align right, Align top, Align middles (on a horizontal axis), Align bottom**, with two shapes or more. Centers and middles go to the middle of the bounds through the widest (or tallest) shape, placed there and rounded once, every other centred inside it, so that aligning again moves nothing.
  - **Distribute horizontally** and **Distribute vertically**, with three shapes or more: in the order of their middles along the axis, the first and the last stay, and the others are spaced between them with equal gaps, each rounded to a whole unit, so that two gaps differ by a unit at most.
  - **Same width** and **Same height**, with two shapes or more: the widest one's width, or the tallest one's height, each shape keeping its top left corner. A container still grows to hold what it holds.
- **Each is stored relative to its own container.** Shapes in different containers align on the canvas; each position is written in its own container's frame, pinned, so layout keeps it (ADR 0015).
- **One action** labelled, for example, `Align 3 shapes to the left`, `Align the centers of 3 shapes`, `Distribute 4 shapes horizontally` or `Give 2 shapes the same width`, counting the shapes that take part: one `set-positions` for the shapes that move, then one `update-free-shape` for each note or arrow that does. A way that would move nothing records nothing and says why: too few shapes, or `They are aligned already.`
- **Where they are offered.** The shape menu lists them, in four groups, while the selection holds two shapes or more that can take part; the canvas toolbar's **Align** opens a menu of them, beside the stacking order and under More with it. An item that would change nothing stays, says why in its tooltip, and says it again when pressed.

## Alignment guides

- **What they show.** While shapes are dragged or a shape is resized, a guide line shows where the edges or the middle of what moves line up with an edge or the middle of a shape in the same container: the container a release would put them in, or World, where notes count too. What is dragged is the bounds of the moving shapes that sit beside the one that carries the pressed shape; a resize looks at the sides it moves only.
- **Snapping.** On each axis, what moves snaps to the nearest guide within 6 pixels of the screen, before the grid does; on an axis with no guide within reach, the grid snaps as before (A3).
- **Turning them off.** Holding Ctrl (⌘ on a Mac) turns them off, in a drag and in a resize, at once, also when pressed or let go mid-gesture. In a move, Alt, which places freely, turns them off too.
- **Cost.** Finding them uses the container's index of the scene near what moves: the band across the screen level with it and the band down the screen beside it, a tolerance wider, since only a shape that meets one of them has an edge or a middle that near. On the 10,000-element view it takes under 1 ms at the 95th percentile, which a test measures with `cpuNow()`.
- **Drawn** as a one-pixel line in the theme's selection color, past the shapes it joins, with a small cross at each end, in the marks layer above the scene, in both themes.

## Keys

- **Alt+Shift with an arrow key** aligns the selected shapes to that side: left, right, top or bottom.
- Shift, Alt, Ctrl and ⌘ while resizing, Ctrl and ⌘ while dragging, and Escape while either goes, as above. The keyboard help lists them.

## Claude

- **`align_shapes`** takes a view, elements and how: `left`, `centers`, `right`, `top`, `middles`, `bottom`, `distribute-horizontally`, `distribute-vertically`, `same-width` or `same-height`. Every shape of each element takes part. It builds the view's scene with the app's own code, so that what it lines up is what the canvas draws, and does what the canvas does as one action labelled as Claude's. When nothing would change it records nothing and says why; too few shapes, unknown elements or an element the view does not draw are refused with the reason.

We chose this because handles, guides and aligning are what every drawing tool has taught people to expect; because one action per gesture keeps the history readable and undo exact (ADR 0017); because storing every aligned shape pinned, in its own container, keeps the model's containment and lets layout leave them be (ADR 0009); and because one module of pure geometry, which the canvas, the menus, the keys and Claude's tool all call, keeps them from ever disagreeing.

## Considered options

- **A container's contents moving with its top left corner**: rejected. Growing a container from its top left corner, to make room there, would carry its contents along and leave the room at the bottom right.
- **Same width and height taken from the first shape selected**: rejected. A selection is a set with no first, and Claude's elements have no order the person sees; the widest and the tallest are the same whoever asks.
- **Guides to every shape on screen, whatever its container**: rejected. A shape stored in another container's frame would move with it and leave the alignment; the shapes in the same container are the ones it stays aligned with.
- **Alt turning snapping off in a resize, as in a move**: rejected. Alt resizes from the middle, as in other drawing tools; snapping is turned off with the grid's toggle.
- **A dialog of sizes**: rejected. The inspector's size fields already are one, and a gesture is what was asked for.

## Consequences

- The spec's Grid and rulers row takes alignment guides in; guides dragged from the rulers and custom spacing stay Later.
- `CONTEXT.md` names the **alignment guide**.
- The canvas's controller hands its pointer and key events to a shape editor after the route editor's, and the renderer draws one more set of marks.
- A drag already under way snaps to guides now, so a shape dragged close to its neighbour's edge lands on it; holding Ctrl or Alt places it as before.
