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
