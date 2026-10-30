---
status: accepted
---

<!-- Decided by Claude on 2026-10-29 under the user's standing delegation of design decisions, from the layout research and benchmark on the user's PostgreSQL model, which the user asked for that day. It is built in stages, as milestone M3c of the spec says. -->

# Layout arranges a view in one pass with rows as ports, routes keep apart in channels, and expanding opens in place

A real data model, 73 tables with 1,088 columns and 163 references in 9 schemas, could not be read in any of its views. The research found three causes, all in how layout and routing are put together rather than in ELK itself:

1. **Lines beside rows are never routed around anything.** The canvas's router goes around shapes only for lines between plain shapes (ADR 0039, clarification W49). A line that ends on a row, or on a shape that draws rows, keeps its stand-in route (ADR 0023): out to a lane 12 to 36 units beside the table, then vertical, then a Z through the middle of the gap. Every reference in a data model is such a line. So lines run through the tables in their way, and lines between different tables take the same middle of the same gap and share long vertical segments.
2. **Layout arranges each container on its own, innermost first, and ELK's routes are dropped** (ADR 0015, clarification of 2026-10-24). A reference between two schemas reaches ELK only as a relation between the two schemas. ELK cannot place a table near the side of its schema that faces the tables it refers to. Inside a schema, the tables that refer to nothing there are placed by ELK's layered algorithm one above the other, in the first column of its flow. The sizes and routes ELK works out are then thrown away.
3. **Expanding a collapsed container moves nothing and makes no room.** Its contents come back at their stored places, and it grows from its top left over its neighbours. Tables collapsed to a header and later opened, by hand or by zoom, cover the tables stacked 80 units below them. Pressing Layout to clear the overlaps moves the opened box up to 11,752 units, out of the viewport.

On the same input, a benchmark of 28 engine settings (draw.io 28.1.2 in its own app, mxGraph, ELK, dagre as DrawDB and Azimutt run it, Graphviz, WebCola and libavoid) found:

- Visual Anything's placement routed by libavoid has no shared segments and no lines through shapes.
- ELK in one hierarchical run, with rows as ports, was the only placement with no shared segment, no line through a shape, no overlapping tables and every end at its row, in all four views measured.
  - Against today's Layout it cut crossings by half: 36 to 18 on `esquema-engine`, 2,192 to 1,138 on the whole database, and 33 to 3 on `procesamiento` with its tables open.
- Expanding in place and pushing neighbours the least keeps the box where it was and moves only what it covers.

## Decision

**Stages.** It is built as M3c, in stages. The first stage holds sections 1 and 4 in their simplest form, section 2 on the program's own router, and section 6:

- one hierarchical ELK run with row ports, with ELK's routes kept until something moves;
- every expansion making room, with the camera following;
- lines beside rows routed by the program's own router, with a channel pass that spreads parallel segments apart;
- the overlay palette, and the short self-reference.

libavoid comes in the second stage, once it routes incrementally in the worker within its budget. The program's router stays as its fallback.

### 1. One layout pass over the view, with rows as ports

- **Layout gives ELK the whole view as one graph** while it is within budget: at most 1,500 shapes and 3,000 relations given to ELK. Containers hold their contents (`elk.hierarchyHandling: INCLUDE_CHILDREN`), so a reference between tables of two schemas is a relation between the two tables. The coordinates come back relative to World (`elk.json.shapeCoords: ROOT`, `elk.json.edgeCoords: ROOT`).
  - Beyond the budget, layout keeps ADR 0015's arrangement, container by container. Each relation that leaves a container then becomes a port on the container's side that faces its other end, so the tables inside still lean toward it.
- **Two passes.** The first pass gives each table its place in the flow. The second puts each row's port on the side of its table that faces the other end: east toward the right, west toward the left, and east on both ends when the two tables stand one above the other. It runs with `elk.layered.crossingMinimization.semiInteractive: true`, so the order found in the first pass holds. ELK never turns a port around.
- **The options**, in `canvas/layout/engine.ts`:

  ```
  elk.algorithm: layered                       elk.direction: RIGHT
  elk.hierarchyHandling: INCLUDE_CHILDREN      elk.edgeRouting: ORTHOGONAL
  elk.spacing.nodeNode: 40                     elk.layered.spacing.nodeNodeBetweenLayers: 64
  elk.spacing.edgeEdge: 12                     elk.layered.spacing.edgeEdgeBetweenLayers: 12
  elk.spacing.edgeNode: 16                     elk.layered.spacing.edgeNodeBetweenLayers: 16
  elk.layered.considerModelOrder.strategy: NODES_AND_EDGES
  elk.layered.cycleBreaking.strategy: DFS_NODE_ORDER
  elk.layered.crossingMinimization.strategy: LAYER_SWEEP    elk.layered.thoroughness: 20
  elk.layered.nodePlacement.strategy: NETWORK_SIMPLEX
  elk.layered.unnecessaryBendpoints: true
  elk.layered.compaction.postCompaction.strategy: EDGE_LENGTH
  containers: elk.padding [top=56,left=24,bottom=24,right=24]
  tables:     elk.portConstraints FIXED_POS, one port per related row and side, at the row's middle
  ```

- **Unrelated contents are packed, not stacked.** In each container, the contents that no relation in the run reaches are left out of ELK's graph. After ELK runs, they are packed in rows in the model's order, toward 1.6 times wider than tall, beside or below the related block, whichever keeps the container nearer that ratio (`packInRows`, as today for a container with no relation inside it).
- **Grouping where the model gives none.** A container that holds more than 30 related contents and no containers is split into communities of its references (Leiden, then Louvain if Leiden's dependency is refused). Each community is arranged as a block, so that tables that refer to one another sit together. The communities are a layout aid, never model data.
- **What does not change:**
  - layout runs in the layout worker, with ELK in workers of its own (ADR 0015);
  - pinned shapes never move (ADR 0009), and a layout is one undoable `set-positions`, unpinned;
  - the 20 s limit and the progress and stop control stay;
  - positions are still rounded to 8 relative to their container. ELK's spacings and the sizes of tables (header 32, rows 24) are multiples of 8, so rounding moves a shape by 4 units at most.

### 2. Routes keep apart: rows go through the router, and parallel lines take channels of their own

- **Every automatic orthogonal line goes through the router**, those beside rows and on shapes that draw rows included. Its end leaves at its row's middle, on the side facing the other end, with a stub of 16.
  - This supersedes W49's exclusion of lines beside rows and to connection points.
  - Lines that end on another line, and lines between a container and what it holds, keep their present routes.
- **A channel pass after routing, as libavoid's nudging does.**
  - Collinear segments of different lines that share a corridor are ordered so as not to cross.
  - They are then spread across the corridor at least 8 units apart, ideally 12. Lines from the same row stay together as one trunk until they part.
  - No two lines without a common end share a segment.
- **The router is libavoid** (Adaptagrams, through `libavoid-js`, LGPL-2.1-or-later, a WASM file loaded by the routing worker `avoid.worker.ts`):
  - shapes are its obstacles, at a distance of 12;
  - each related row gets a pin on each side of its table, and libavoid takes the cheaper one;
  - nudging is on (`idealNudgingDistance` 10, `nudgeOrthogonalSegmentsConnectedToShapes`, `nudgeSharedPathsWithCommonEndPoint`, `nudgeOrthogonalTouchingColinearSegments`);
  - the crossing penalty is used only up to 40 lines in a container, since it makes routing far slower;
  - the router stays incremental: it routes again only the lines whose shapes moved. Our own visibility-graph router stays as the fallback if the WASM fails to load.
- **ELK's routes are kept right after a layout.** A layout from section 1 brings ELK's routes back with the places. Until a shape that a route passes, or one of its ends, moves, the canvas draws that route, carried by the rounding of its ends. After that, the router routes the line. Nothing is stored (ADR 0039 holds).
- **A relation from a row to its own table** draws a small C: out 16 units on the table's right side, along to the other row, and back. A curve draws one arc of the same reach, never a loop round the table.

### 3. Curves degrade beyond a few lines

- **The automatic curved style (ADR 0069) is honoured while a container holds at most 24 curved lines**, and no curve crosses a shape that is not one of its ends.
- **Beyond that, the canvas draws those lines orthogonal with rounded corners** (radius 16). They go through the router as above. The view's inspector says so: "Drawn with rounded corners: 63 lines are too many to follow as curves". Nothing in the file changes; a hand route keeps its own style.

### 4. Expanding opens in place

- **The box keeps its top left.** It grows to the right and down, unless there is more free room to its left (or above) inside its container. In that case it keeps its top right (or bottom left).
- **Its contents.** Unpinned contents are laid out again inside it by section 1, with only the box's contents in the run. Pinned contents stay where they are.
- **Its neighbours.** Level by level up to World, the siblings the grown box now comes within 40 units of move right or down, whichever is less. They move by the least that clears it, keep their order, and push on whatever they in turn cover. This is ADR 0015's "moving aside", applied to every expansion.
  - Pinned shapes, rows, notes and arrows never move; a shape moved aside goes past them.
  - Containers grow around what moved.
- **Collapsing gives the places back.** The app keeps, per tab, the places that expanding a container moved. Collapsing it again, while those shapes have not moved since, sends them back in the same action. After a reload, collapsing leaves them where they are, which overlaps nothing.
- **Actions.** Expanding by hand stays one undoable action. It is `set-collapsed`, plus the `set-positions` of what it laid out and moved aside, joined under the same label, `Expand "config"`, as ADR 0065 joins placement to the action that caused it. Undo puts everything back.
- **Expanding by zoom** (ADR 0055, `expandFrom`) is never stored. The canvas draws the moved-aside shapes at their moved places as drawn rectangles, as an overlay sizes a shape without moving it, and nothing is written.
- **The camera.**
  - If the expanded box no longer fits the screen, the camera eases over 240 ms to show it whole, with 48 pixels around it.
  - If it fits but sticks out, the camera pans by the least that brings it in.
  - Under reduced motion, the camera cuts.

### 5. Reading many lines

- **Detail by zoom.**
  - A table's name stays readable far out: below the scale where rows stop writing, its header is written at 12 screen pixels at least, and its rows draw nothing.
  - A view may show only key rows (`rows: "keys"` in the view file): rows that are primary keys, or that a drawn relation ends on.
  - Relations still attach at their rows.
- **The selection's relations.** In a view with more than 40 lines, selecting a shape or a relation draws the lines that do not touch it faintly, as focus at one degree does, until the selection is cleared. The view's details can turn this off.

### 6. Overlay legends keep their colors apart

When an overlay's colors are generated, they come from a palette validated to stay at least 3:1 apart, pair by pair, against each theme's canvas. Hand-chosen colors keep their present warnings.

## Layout quality, held by tests

`canvas/layout/quality.ts` measures a view as drawn after Layout. The tests hold these thresholds:

- **On a fixture shaped like the user's model** (same counts and structure, generated names):
  - `esquema-engine`, `overview` expanded, and `procesamiento` with its tables open;
- **On the synthetic 10,000-element view.**

| Measure | Threshold |
|---|---|
| Segments shared by two lines with no common end | 0 |
| Automatic orthogonal lines through a shape that is not one of their ends | 0 (at most 1% of the lines where the router gave up) |
| Sibling shapes that overlap | 0 |
| Crossings per line | at most 0.6, and no more than before the change |
| Bends per line | at most 2 on average |
| Ends on a row that lie at that row's middle | 100% |
| Fill (area of the tables over the view's box), views of 10 tables or more | at least 0.25 |
| Aspect ratio | between 0.5 and 3 |
| Expanding a container | its anchored corner moves 0; no other shape moves more than the box grew plus 40; nothing overlaps; the box is whole on screen after the camera eases |
| Collapsing it again | every moved shape back within 1 unit |
| Stability | Layout twice moves nothing; after one table is added and laid out, at most 10% of the other shapes move, by 80 units on average at most |
| 10,000 elements | layout within ADR 0015's 20 s; every line routed in the worker within 3 s; no main-thread task over 50 ms |

## Considered options

- **Keeping the per-container arrangement and tuning its options**: rejected. A reference between two schemas would still reach ELK only between the schemas, so no option can place a table near the side its references leave from.
- **Graphviz dot**:
  - it had the fewest crossings on the smallest view, with `splines=ortho`;
  - rejected: `splines=ortho` ignores ports, so lines end far from their rows; with ports, its splines crossed six times as often;
  - it is a WASM build of a C program whose clusters cannot hold given places, which pinned shapes need.
- **dagre**, as DrawDB and Azimutt use it: rejected. It has no ports, its compound graphs are limited, and its lines crossed tables (ADR 0015 already rejected it).
- **draw.io's layouts** (mxGraph): rejected as a model.
  - Its Arrange menu lays out only the page's top level.
  - Run on each container, its flow layouts stacked every table in one column, since relations that end on rows are not part of the graph they see (aspect 0.02 on `esquema-engine`).
  - Its organic layout, with relations on tables, left 14 to 17 tables overlapping.
  - Expanding a group keeps its top left and moves nothing, as Visual Anything does today.
- **WebCola**: rejected. It is a force layout with groups; its lines are straight and crossed shapes, and its layouts change much from run to run.
- **Our own channel router rather than libavoid**: kept only as the fallback.
  - A prototype grid router with a congestion cost removed shared segments and lines through shapes, but crossed more than libavoid did.
  - libavoid's ordering and nudging is the published solution (Wybrow, Marriott and Stuckey, GD 2009), and ELK itself wraps it.
- **Storing ELK's routes**: rejected, as ADR 0039 decided. A stored route would be wrong after the first move.
- **Re-laying out the whole view on expand**: rejected. It moved the opened box by up to 11,752 units and every other shape by up to 10,101.
- **Refusing the curved style beyond a count**: rejected. Degrading to rounded corners keeps the view's choice and its look while staying readable.

## Consequences

- **Superseded.** This supersedes these clarifications, each from the stage that builds what replaces it:
  - ADR 0015's "how a layout arranges a view" (innermost first, a block per container) and "ELK's own routes are not kept", while a view is within budget;
  - ADR 0023's lanes as the final route beside rows (they stay the stand-in route);
  - ADR 0039 W49's exclusion of lines beside rows and to connection points;
  - ADR 0069's automatic curves beyond 24 lines in a container.
- **Unchanged.** ADR 0009, 0015's worker and budget, 0024's command and 0065's joining stay as they are.
- **The view file** gains the optional `rows` (`"all"`, the default, or `"keys"`). The live protocol's version goes up.
- **A new dependency**, `libavoid-js` (LGPL-2.1-or-later), joins the licenses ADR 0047 lists for code that ships. It ships as a separate WASM file the person can replace.
- **ELK's run over a whole view costs more than a block per container.** On the user's views it took 0.1 to 2.5 s in Node, against 0.1 to 0.6 s today. The budget in section 1 keeps the 10,000-element view on today's path.
- **ELK's interactive strategies refuse a hierarchical run.** `layering`, `crossingMinimization`, `cycleBreaking` and `nodePlacement` set to `INTERACTIVE` throw `UnsupportedGraphException` for LAYER_SWEEP. So stability across layouts relies on `semiInteractive` and on expanding in place, not on those strategies.
- **libavoid routing everything at once does not scale.**
  - It took 0.2 s for 34 lines, 6.5 s for 86, and did not finish in 10 minutes for 154.
  - So it is used incrementally (its `moveShape` and `processTransaction`, one container at a time), and the crossing penalty is limited as said.
  - A view whose lines cannot be routed within the worker's budget keeps ELK's routes or the stand-in routes.
- **Pinned shapes that overlap after an expansion stay overlapped,** since nothing moves them. The canvas outlines them and the view's inspector offers to unpin them, so that layout can place them.
- **New terms.** CONTEXT.md gains **Trunk** (the shared first run of the lines that leave one row or shape toward several ends; _Avoid_: bundle, which an aggregated relation is not) and **Expand in place**.

## Clarifications

<!-- Decided by Claude on 2026-10-29 under the user's standing delegation of design decisions, while building Stage 0a. -->

- 2026-10-29: how Stage 0a builds sections 1 and 4.
  - **Which layouts take one pass.** Layout of the view, Layout of a container's contents, and the layout of an expansion's contents go in one pass while they fit the budget. The automatic layout of new shapes keeps the arrangement container by container, since it places only shapes without a position among kept ones.
  - **What the run holds.** The budget counts the shapes the run holds: those a relation of the run reaches, and the containers that hold them. A view whose relations reach nothing, or where a drawing with parts holds shapes to arrange, is arranged container by container as before.
  - **Copies of a container** (ADR 0019) are in the run once, through the first copy, holding its contents; every other copy is a shape of its present size. If a copy then grows past what it was given, the shapes it covers move right or down by the least, as a last pass.
  - **Pinned and kept containers.** ELK's layered algorithm cannot hold a given place. A kept container is in the run to hold its contents, and where ELK puts it is dropped: the container stays, and the free shapes beside it are placed clear of it as before.
  - **Room for what the run leaves out, and for a container's least size.** After the first pass, each container that holds contents the run leaves out reserves room for their block, packed in rows, beside or below what the run arranged, whichever keeps the two nearer 1.6:1; it does so through its padding in the second pass. Its padding also holds it to its appearance's size and to the size the view stores, so that the scene never draws it larger than ELK placed it.
  - **Places in a container** stay where the run put them, rounded to 8, rather than moved to the contents' origin, so that ELK's routes still meet them. A container that keeps shapes places what moved clear of them as before.
  - **Which routes are kept.** A route is kept when both its ends landed within 24 units, each way, of where ELK put them; its last point and the bend before it are carried by that rounding. It is dropped when it then runs through a shape that is not one of its ends, when one end lies in a container kept where it was, and when its line runs between other copies of its ends. The canvas keeps a route only for an automatic orthogonal line that no line ends on, whose ends lie where the scene draws them. A curved, straight or hand route keeps its own, so a view drawn with curves, as `procesamiento` is, keeps its curves until section 3's stage.
  - **Until a shape they pass moves** is told from the scene drawn right after the layout: a route is dropped once one of its ends changes, or once a shape that changed stands across its corridor, 12 units each side, where it stood or where it stands. A container counts by its sides, so that a table moving inside a schema drops only the routes that cross the schema's border where it changed.
  - **Expanding in place by hand** also happens from the outline and the inspector, which expand the open view as the canvas does. The box grows toward its left, or up, only when its own container has more free room there than to its right, or below, and room enough for what it grew plus 40; in World it keeps its top left. The places moved aside are kept per tab, by view and by the container expanded; when several are expanded at once, they go back when the first of them collapses.
  - **Expanding by zoom** draws the view from a copy of its positions holding the places the expansion gives, worked out in the layout worker from the stored places and the whole set the zoom expands. A container shows expanded once its places are worked out, so that it never covers its neighbours meanwhile; a place is drawn only while the shape's stored place is still the one it was worked out from. Layout and drops then read the drawn places.
  - **The camera** follows an expansion by hand only. Expanding by zoom follows the person's zoom: easing the camera out to show a box larger than the screen would take the zoom below where the box expands, and collapse it again.
  - **Overlapping siblings**, as `quality.ts` counts them, are pairs of which at least one is not pinned. Pinned shapes that cover each other are counted apart, since layout moves neither.

<!-- Decided by Claude on 2026-10-29 under the user's standing delegation of design decisions. -->

- 2026-10-29 (merging Stage 0a): **the answers to the stage's questions, and two items moved forward to Stage 0b.**
  - **A curved view keeps its curves after Layout.** ELK's routes replace only automatic orthogonal lines, since the curved style is the view's choice. What makes a curved view with many lines readable is section 3: past 24 curved lines in a container, they draw orthogonal with rounded corners through the router. It moves forward from Stage 2 to Stage 0b, since it shares 0b's router and the user's `procesamiento` view needs it.
  - **The camera follows only expansions by hand.** Fitting a box opened by zoom would zoom out below the scale it opens at, and close it again.
  - **While an expansion by zoom is drawn,** dragging and Layout read the places as drawn. A drag stores what the person sees.
  - **Pinned shapes that stay overlapped, or that keep a one-pass layout from placing what they hold, are outlined, and the view's inspector offers to unpin them,** as the Consequences say. It moves forward to Stage 0b. In the user's model, four pinned schemas leave most of `overview`'s lines outside ELK's run.
- 2026-10-29 (from the user's notes on their first real model): **collapsing closes the room it leaves.** A container collapsed with no places to give back (expanded since the view was made, or after a reload) leaves a hole the size it had open. Collapsing then moves the shapes it freed back left or up, by the least that keeps 40 units apart, in their order, level by level up to World. Pinned shapes never move. It is part of the same undoable action as the collapse, and it is built in Stage 1.


<!-- Decided by Claude on 2026-10-30 under the user's standing delegation of design decisions, while building Stage 0b. -->

- 2026-10-30: **how Stage 0b builds sections 2, 3 and 6, and what it measured.**
  - **Which lines beside rows the router takes.** Every automatic orthogonal line between two shapes, a row, a shape that draws rows or a plain shape at either end, superseding W49 for rows. Lines to connection points keep their routes still: the router does not start at a connection point yet. A line that leaves beside a row and ends on another line, and a line from a row to its own table, keep theirs.
  - **The ends.** An end leaves on the side the scene chose (ADR 0023: facing the other end, or the right on both ends of tables that stand one above the other), at the row's middle, straight out for 16 before it turns, its search starting that way. Its own table is gone around 12 out, so the stub's tip lies clear.
  - **What lines beside rows go around.** Shapes drawn as one block, a row's table rather than its rows, and the name plates of every container they cross, 12 away, or 4 or 1 where a neighbour stands nearer than the stub and the clearance. A container drawn open is run through, between what it holds, as libavoid was given only blocks and plates in the research. A shape that covers one of the line's ends, as the pinned schemas of `overview` cover tables, is not gone around: it cannot be. At most 160 shapes are gone around; with more the line keeps its lane route, counted as given up.
  - **Keeping corridors apart while routing.** One channel pass cannot separate 48 lines in a corridor 32 wide, as `overview` had between two columns of tables. So the router, as the research's grid router did, makes running within 8 of another line's run cost 2 more a unit of length, and crossing one cost 128, where the two lines share no end; and a turn costs 240. Lines take corridors of their own; the pass spreads what still runs together. A stand-in route that crosses nothing is still routed when it runs along another line's run. The canvas sends the lines drawn already, ELK's kept routes among them, with each request to the worker.
  - **The channel pass** runs in the routing worker, once every route asked for has come, over every line drawn; it changes only the inner runs of automatic orthogonal lines. First it straightens jogs under 16 between runs that go on the same way, where the straight run stays clear of shapes. Then, three times over both directions, it gathers runs nearer than 12 that overlap by more than 4, ordered so that the one that starts later turns toward its side, and so does the one that ends sooner. It spreads them 12 apart, or 8, or less, down to 2, where the room and the runs they join allow no more. It looks in the free stretch nearest them, clear of shapes by 12 (4, then 1, where they already lie nearer), and of fixed runs and other corridors' runs by 8. The runs they join keep their stubs and never turn back. When a corridor cannot be placed whole, the run with the least room stays and the rest go around it. Runs of lines with a common end on one place move as one: a trunk.
  - **Curves (section 3).** A curve degrades to orthogonal with rounded corners (radius 16, less where a run is shorter than 32) when its container, the shape holding both its ends, holds more than 24 automatic curved lines. It also degrades when it would cross a shape that is neither one of its ends nor holds one, since the section honours curves "while … no curve crosses a shape". The line keeps its orthogonal route for routing, hit testing and labels; its spans draw it. The view's details say how many lines are drawn so, and why ("too many to follow as curves", or "would cross other shapes"), in English and Spanish. ELK's kept routes are not used for them: they go through the router, as section 3 says.
  - **The self-reference.** Both ends on one table, rows or its header: a C out 16 on the side both ends leave by, the right, and back; curved, one cubic span whose control points stand 16 × 4/3 out, so it reaches 16. The channel pass leaves it where it is. On `schema-view` it crosses one line that leaves between its two rows, which the lane C passed outside of: 24 crossings against Stage 0a's 23.
  - **Pinned shapes in the way** are pinned siblings that cover each other, and pinned open containers that hold an end of a relation whose other end lies outside them. They are outlined on the canvas, 6 pixels out, in the refused color. The view's details list them, at most 8 by name, with one action, Unpin them (`Unpin {n} shapes`, `Desfijar {n} formas`), a `set-positions` that keeps their places, unpinned.
  - **The palette (section 6) cannot be 3:1 apart pair by pair.** A color 3:1 against both canvases has a relative luminance between 0.13 and 0.30, and two such colors are at most 1.96:1 apart; for one canvas alone, at most three colors can be 3:1 apart. So the generated palette, the eight colors "Add each value it has" already used, is validated as far as it can be: each color 3:1 against both canvases, and every two at least 20 apart in CIELAB (CIE76), told apart by hue as well as lightness. The legend still warns about pairs under 3:1, for generated colors too; whether the legend should measure generated pairs by color difference instead is a change to the core's legend, asked of the main session.
  - **Measured on the fixture after Layout** (before, Stage 0a → after): `schema-view` 0 → 0 shared, 0 → 0 lines through shapes, 23 → 24 crossings, 1.67 → 1.67 bends a line. `overview` expanded: 12 → 16 shared, 87 → 1 through and 15 over shapes that cover their ends, 2,083 → 1,832 crossings, 1.89 → 4.01 bends. `overview` expanded and unpinned: 1 → 0 shared, 15 → 0 through, 1,825 → 1,681 crossings, 3.27 → 3.32 bends. `processing` with its tables open: 0 → 0 shared, 13 → 0 through, 39 → 41 crossings, 0.93 → 1.57 bends. Every end on a row is at its row's middle. Not held, and why:
    - **Bends at most 2 on average** on `overview`: its lines cross the whole view, and ELK's own routes there bend 3.3 times a line, as the research measured (3.17).
    - **0 shared** on `overview` with its pinned schemas: the corridors between the tables they cover hold more lines than they have room for. Unpinned, 0.
    - **Crossings** on `processing`: 2 more, from the 13 curves that crossed tables and now go around them.
  - **The 10,000-element view** (the synthetic tables view, 10,301 shapes and 997 lines, Node on the user's laptop). On the main thread: the routing request 26 ms with the lines drawn already 5 ms, a composition 11 ms, the channel pass's input 15 ms, its routes applied 7 ms. In the worker: every line routed in 0.48 s, 11 given up (1.1%), and the channel pass 0.7 s. Recorded, not held.

<!-- Decided by Claude on 2026-10-30 under the user's standing delegation of design decisions, merging Stage 0b. -->

- 2026-10-30 (merging Stage 0b): **the answers to the stage's questions.**
  - **Overlay colors are told apart by their difference, not by contrast with one another.** The contrast between two fills is the wrong measure for telling categories apart: colors that each keep 3:1 against both canvases cannot also keep 3:1 between them. So a legend judges every pair of an overlay's colors, generated or chosen by hand, by their difference in CIELAB (ΔE76 of at least 20), and warns under it. Each color still keeps 3:1 against the canvas. This supersedes section 6's "at least 3:1 apart, pair by pair". The core's legend check changes in the main session.
  - **A curve that would cross a shape also degrades to rounded corners,** line by line, besides the count of 24 in a container. Kept as built.
  - **Lines to connection points** keep their present routes until Stage 1, which routes them through the router as lines beside rows are.
  - **On `overview`, the routing thresholds are held on the case with its pinned shapes unpinned.** The case as the user pinned it is held to the numbers reached, since lines cannot go around a pinned shape that covers their own end.

<!-- Decided by Claude on 2026-10-30 under the user's standing delegation of design decisions, while building Stage 1, part a. -->

- 2026-10-30: **how Stage 1's first part builds collapsing that closes its room, lines to connection points, container ports, and the incremental scene's mark.** libavoid, trunks and communities come in a later part.
  - **Collapsing closes the room it leaves** (this ADR's clarification of 2026-10-29), in `canvas/layout/closeRoom.ts`. When collapsing gives no place back, the siblings that stood right of the open box, within 40 of its height, and those right of them in turn, move left by up to what it shrank across; those below it, and below them in turn, move up by up to what it shrank down. Each, in its order, stops 40 from whatever stands before it, moved or not, on the step of 8, and never moves right or down. Pinned shapes, rows and anchored parts never move and stand in the way. A container whose contents closed up shrinks, and its own level closes up after it, up to World. It is one `set-positions` in the collapse's batch. When collapsing gives places back, it gives them back and closes nothing more.
  - **Lines to connection points go through the router** (`canvas/routing/avoided.ts`, `avoid.ts`), for a shape drawn as its box: the line leaves the point the scene chose straight out of its side, left, right, up or down, with a stub of 16, as lines beside rows do, with their costs for running along and crossing other lines. A shape with an outline of its own, or drawn by its picture, keeps its route to a connection point still, since its points are carried in to the outline and the router reads its box.
  - **Container ports beyond the budget** (section 1). When a layout that would go in one pass is beyond the budget, each relation that leaves a container is, at each container it leaves, an edge from the content it leaves by to a port of the block on its east side, toward the relation's `to` end, or from a port on its west side, from its `from` end (`Outward` in `canvas/layout/engine.ts`). These are the sides that face the other end in the layered flow, which runs to the right; the places before the layout are not read, since layout gives new ones. ELK places the external port in the block's first or last layer, so a content related out of its container leans toward that side: in the test, a content related only out of its container moves from the first layer to after the others. The automatic layout of new shapes, which arranges container by container within the budget too, does not take them.
  - **The incremental scene's mark is 50 ms again.** On the reference laptop, the move of a shape with free geometry and 50 relations takes 2 to 13 ms on the clock, 1.7 ms on average over 200 moves; Stage 0b's curve checks are 0.14 ms of it. The 57 to 79 ms read after Stage 0b were the process's CPU time, which counts every thread of the process, the garbage collector's helpers included, and which Windows counts in steps of 15.6 ms: one collection on a few threads during a move of 3 ms read as 47 to 78 ms, and with the collector on one thread the reads fell to 0 to 31 ms. The test now reads a stopwatch that takes the least of the process's time and the clock (`stopwatch` in `test/cpu.ts`), which neither a loaded machine nor the collector's threads stretch; it reads 5.5 to 13.4 ms. The curve check no longer copies the shapes near each point it looks at. The channel pass's input runs in the canvas, not in this test, and is left as Stage 0b measured it.
  - **Measured on the fixture after Layout** (before → after this part): `schema-view` 0 → 0 shared, 0 → 0 through, 24 → 24 crossings, 1.67 → 1.67 bends a line; `overview` expanded 16 → 16 shared, 1 → 1 through and 15 → 15 over covering shapes, 1,832 → 1,832 crossings, 4.01 → 4.01 bends; `overview` expanded and unpinned 0 → 0 shared, 0 → 0 through, 1,681 → 1,681 crossings, 3.32 → 3.32 bends; `processing` with its tables open 0 → 0, 0 → 0, 41 → 41, 1.57 → 1.57. Every end on a row at its row's middle, no overlapping siblings. The fixture has no connection points and stays within the budget, so nothing in it changed; its thresholds hold as before.
- 2026-10-30 (M3c, after merging Stage 1a): **what Stage 1a left.** Decided by Claude under the user's standing delegation.
  - Stage 1a's change to the program's `set_positions` description and answer is kept. It names the routes whose ends moved apart, since their bend points are no longer said to stay where they were.
  - Lines to connection points on a shape with its own outline, or drawn as a picture, go through the router in Stage 1b, once the connection points are carried onto the outline. Until then they keep their old route.
  - The automatic layout of new shapes gains container ports beyond the budget in Stage 1b, as the one-pass layout has them now.
  - The spec splits Stage 1 into 1a (done) and 1b (libavoid, trunks, communities and these two).

<!-- Decided by Claude on 2026-10-30 under the user's standing delegation of design decisions, while building Stage 1b. -->

- 2026-10-30: **how Stage 1b builds libavoid, trunks, communities, connection points on outlines and container ports for new shapes, and what it measured.**
  - **libavoid-js 0.5.0-beta.5**, pinned exactly: npm's `latest` on 2026-10-30, published 2026-02-23. Its WebAssembly is served as `/libavoid.wasm`, unhashed, beside the app (a Vite plugin serves it in dev mode and copies it into the build; the server gives `.wasm` the type `application/wasm`), so the person can replace it. ADR 0047 records it among the code that ships, and the notice `pnpm package` writes names it.
  - **libavoid stays behind a flag, the program's router the default.** It does not keep within the routing budget ("every line routed in the worker within 3 s"): on `overview` expanded, World's 90 lines among 101 obstacles did not finish in 4 minutes, with the crossing penalty or without, and one schema's 34 lines among 29 obstacles took 0.07 to 3.1 s from run to run. So the routing worker uses it only when `visual-anything.router` is `libavoid` in the browser's storage (a request names the WebAssembly's address), and then only within a budget: at most 40 lines and 400 obstacles in a container, 2 s a request (the containers after fall back), and a container that took more than 1 s falls back from then on at as many lines or more. The program's router routes what libavoid does not, keeping apart from what it routed.
  - **It cannot load in the app as the policies stand.** libavoid-js's glue makes functions from text (embind's `new Function`) and compiles WebAssembly; `WORKER_POLICY` refuses both, and ADR 0054 gives every script but the code worker that policy. Under it the load fails, the worker notes it once, and the program's router routes everything, so turning the flag on changes nothing in the app until the routing worker gets a policy of its own (`'unsafe-eval' 'wasm-unsafe-eval'`, still no connection: the page could hand it the file's bytes). That is a change to ADR 0054 and ADR 0027, left to the main session. In Node, where the tests run, it loads.
  - **Incremental by container** (`canvas/routing/libavoid.ts`): each container that holds both ends of some lines keeps a libavoid router across requests while the scene's nesting stays the same. Its obstacles are the shapes drawn as one block inside it, through the containers drawn open, the name plates of those and of the container itself, and four walls just outside it, so its lines stay inside. A shape that moved is moved (`moveShape`); obstacles that change in number or size build the router again; connectors are added and dropped by what they join. The lines drawn already in that container are connectors too, and their new routes come back with the reply (`others`), so that what libavoid nudged apart is drawn so. A line with an end that is not a block of the container, or that another obstacle covers whole, as a pinned schema covers its tables, is left to the program's router, as is a connector libavoid finds no orthogonal route for.
  - **Pins.** A row's end gets a pin on each side of its table at the row's middle, and libavoid takes the cheaper; a connection point one pin, facing out of its side; a plain shape one at the middle of each side, moved by the line's offset among its siblings. Pins are shared, not exclusive.
  - **Options, against section 2's list.** `nudgeOrthogonalSegmentsConnectedToShapes` and `nudgeSharedPathsWithCommonEndPoint` are off: on, libavoid moved ends 5 units off their row's middle, which section 1's thresholds forbid, and pulled apart the lines of one row, which section 2 keeps together as a trunk. `nudgeOrthogonalTouchingColinearSegments` is on, `idealNudgingDistance` 10, the buffer 12 and a segment costs 200. The crossing penalty is off: weighed on the containers of 20 lines or fewer, it made lines run together, 7 shared segments to 105 on `overview` unpinned.
  - **Trunks** (`gatherTrunks` in `channels.ts`), for libavoid's routes and the program's alike, before the spreading: lines that leave one place of one end the same way, and turn the same way at their first turn, move that turn onto one place, the one most of them can take and nearest the end where as many can, so they share their first run until they part; the spreading already keeps runs on one place with a common end together. A line joins only when its first run keeps its stub, the run after its turn keeps its way, nothing it would sweep stands in the way, and it crosses no more lines for it; alone at the place it keeps its route. It works at both ends of each line.
  - **Communities** (`canvas/layout/communities.ts`): Louvain, written in the program (Leiden would need a package; its guarantee that each community is connected is had by splitting each into its connected parts after). In the one-pass run, every container that holds more than 30 nodes and no compound one, World included, has each community of two or more nodes made a compound node of its own (padding 16), so ELK arranges it as a block; a node alone in its community stays where it was, and one community of two or more splits nothing. Nothing reads the communities' places, and nothing stores them.
  - **Connection points on outlines and pictures go through the router.** The router leaves the point's place on the box, straight out of its side with a stub of 16, and the route is carried in to the outline along that first run, as the scene carries the point in; the point an end lies at is the one whose place, carried in, lies within 1 of where the scene draws the end. A shape drawn by its picture leaves at the point's place on its plate.
  - **Container ports in the automatic layout of new shapes**: it arranges container by container, so each relation that leaves a container is a port on its side, as beyond the budget (`Outward`).
  - **Measured on the fixture** (Stage 1a → Stage 1b, the program's router, after Layout): `schema-view` 0 → 0 shared, 0 → 0 through, 24 → 24 crossings, 1.67 → 1.67 bends; `overview` expanded 16 → 16, 1 (+15) → 1 (+15), 1,832 → 1,821, 4.01 → 4.01; `overview` expanded and unpinned 0 → 0, 0 → 0, 1,681 → 1,681, 3.32 → 3.32; `processing` with its tables open 0 → 0, 0 → 0, 41 → 38, 1.57 → 1.57. With libavoid after Layout (most lines keep ELK's routes): the same on `schema-view`; `overview` 25 shared, 4 (+13) through, 1,828 crossings; unpinned 0, 0, 1,688; `processing` 0, 0, 43, 1.43 bends. With every line routed, as after a move (program's router → libavoid): `schema-view` 4 → 0 shared, 38 → 55 crossings, 1.56 → 2.33 bends; `overview` 50 → 24 shared, 1,885 → 2,008 crossings; unpinned 23 → 11 shared, 1,484 → 1,355 crossings, 2.96 → 3.06 bends; `processing` 38 → 43 crossings, 1.57 → 1.43 bends. Every end on a row at its row's middle throughout. libavoid's time per container, every line routed: `schema-view`'s schema (34 lines, 29 obstacles) 65 to 420 ms; on `overview`, 1 to 12 ms for containers of 1 to 12 lines, 1.6 to 3.1 s for the schema of 34, and World (90 lines) beyond the budget. The program's router and the channel pass took 3 to 520 ms a view in Node.
