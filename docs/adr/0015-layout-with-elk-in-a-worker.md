---
status: accepted
---

# Layout with ELK (elkjs), run in a Web Worker

Automatic layout uses ELK through elkjs, run in a Web Worker so it never blocks the canvas. Each layout receives the view's shapes with their nesting, connection points and pinned positions; an element with several containers in the same view is passed as one copy per container. We chose ELK because it already solves what matters most for readability: layered layout of nested graphs, connection points, and orthogonal routing that keeps relations from tangling. Its license (EPL-2.0 or GPL-3.0-or-later, from version 0.12) is compatible with the AGPL planned for publication.

## Considered options

- **dagre** (@dagrejs/dagre, MIT): rejected. Layered layout only, with limited nesting support and no orthogonal routing.
- **Own implementation**: rejected. Months of work on a problem ELK already solves well.

## Consequences

ELK is a large dependency and layout results arrive asynchronously, so the canvas must show shapes in their previous positions until a new layout is ready.

## Clarifications

<!-- Decided by Claude on 2026-10-24 under the user's standing delegation of design decisions. -->

- 2026-10-24: what a layout moves, and how it is stored.
  - **Automatically**, the shapes a view shows without a position: all of them when the view opens, and each new one after that, such as the elements Claude adds. In each container, or World, where such a shape sits, every shape without a position is arranged; every shape with one stays. A shape whose position an undo took away is not new, so undo can go on past a layout.
  - **On demand**, from Layout in the canvas toolbar: every shape of the view that is not pinned, or, with one container selected, every shape inside it, at any depth, that is not pinned. The container stays where it is.
  - Pinned shapes never move (ADR-0009). The result is checked against the view as it is when it comes back, and stored as one undoable action: one `set-positions`, unpinned, keeping every stored size, named `Lay out "System overview"`, `Lay out the contents of "Scheduling"`, `Lay out "Billing" in "System overview"` or `Lay out 3 new shapes in "System overview"`. Positions it would leave as they are are not written, so laying out again changes nothing.
- 2026-10-24: how a layout arranges a view.
  - Each container, and World, arranges its own contents, innermost first, so that a container's size is known before it is arranged among its neighbours. Every copy of a container shares its contents' positions (ADR-0019), so they are arranged once, through its first copy.
  - The shapes layout may move at one level form one block. ELK's layered algorithm arranges it from left to right along the relations between them, each lifted to the level where its ends meet: a relation between the contents of two containers orders the two containers. Only the relations that close a cycle are reversed, found depth first in the model's order (`DFS_NODE_ORDER`), and the model's order breaks ties. A block of more than 12 shapes wraps its flow into rows toward 1.6 times wider than tall, so that a long chain of relations reads like lines of text instead of running far to the right; a shorter flow keeps to one row. A block with no relation inside it is packed in rows, about 1.6 times wider than tall, without ELK.
  - Fixed shapes are not part of ELK's graph, since ELK's layered algorithm cannot hold a shape at a given place. The block is placed clear of them, and in World clear of notes and arrows too: at the container's contents origin, or in World where its shapes start now, when nothing there stays; otherwise beside what stays when relations lead mostly from it into the block (to its right), or in World mostly out of the block (to its left), and below it otherwise.
  - Spacing: 40 between shapes in one layer and between rows, 80 between layers, 40 below and 80 beside what stays. Every position is rounded to a multiple of 8 relative to its container, and a container's contents never start above or left of its contents origin.
- 2026-10-24: connection points are ELK ports. A relation that ends on a shape with connection points ends on a port there, fixed on its side at its place along it; elsewhere it attaches anywhere on the border. Each end uses the point nearest the middle of the side layout's flow takes: the east side where a relation starts and the west side where it ends, the other way round for a relation that closes a cycle, so that ELK never has to turn a port around. Relations store nothing about it. A shape that draws its contents as rows (wave 2) is one block with a port for each related row.
- 2026-10-24: where layout runs. The app takes each layout's input from the scene it draws, so that layout works with the sizes and containment the canvas shows: one pass over the scene on the main thread, and a copy of the input to the layout worker. Everything else runs in the worker. ELK runs in workers of its own, started from the layout worker, because elkjs takes over the message handler of any worker it is loaded into: one for every two cores, up to three, among which the containers of one depth are shared out. ELK's own routes are not kept: positions are rounded and blocks placed after ELK runs, so the canvas routes relations itself.
- 2026-10-24: how long a layout may take, and how it is followed and stopped.
  - ELK's time grows with a level's shapes times its relations beyond one per shape (on the benchmark's laptop, 400 shapes took 2.4 s with 400 relations and 104 s with 800), and its stronger options for large graphs were slower, not faster. So each level gives ELK at most 4,000 of that product: beyond it, the pairs related by the most relations are kept, then the first in the model's order.
  - The containers of one depth go to ELK in chunks of about 600 shapes and relations, which the ELK workers take in turn: each chunk done is a step of progress.
  - ELK runs at most 20 s in all for one layout. An ELK worker still running then is stopped, and started again for the next layout; the chunk it had, and the containers not yet given to ELK, are packed in rows. So a layout ends within about 20 s, besides copying its input and result. The 20 s are counted on the worker's clock, so a machine too busy to give the worker time makes it later.
  - While a layout runs, automatic or asked for, Layout shows how far it has come (`Stop layout (40%)`), and pressing it stops the layout, which then moves nothing. Stopping a layout stops the layout worker, since ELK cannot be interrupted; the next layout starts a new one.
  - Measured on the shared, loaded laptop, with ELK in one thread: the synthetic view of 2,000 elements took 9 to 15 s (86 s before the work budget), and of 10,000 elements 30 to 37 s, nearly all of it for its 400 containers, which the app shares among its ELK workers. In the app, with two ELK workers, laying out the 2,000 elements when the view opened took from 5 s to 14 s.
- 2026-10-24: a layout's result moves in over 320 ms, its relations routed again on every frame, unless the system asks for reduced motion or the view holds more than 1,500 shapes, where it shows at once.

<!-- Decided by Claude on 2026-10-26 under the user's standing delegation of design decisions. -->

- 2026-10-26 (M8b): **shapes beyond boxes.**
  - **Free geometry** (ADR 0066). ELK takes a shape with free geometry by its rectangle, and its connection points as ports on their sides of that rectangle, at their places along them, as for any shape. Its outline never reaches ELK, and spacing is measured between rectangles.
  - **Drawings with parts** (ADR 0067). A drawing with parts is one block, as a shape that draws rows is.
    - Its size comes from its header, its picture and its other contents.
    - It has a port for each related anchored part, on the block's side nearest that part's inner point, at the place along that side nearest it.
    - Anchored parts are not given to ELK. Their relations are lifted to the drawing, as relations to rows are lifted to their table.
    - Its contents that are not anchored parts are arranged below its picture.
  - **Route styles** (ADR 0069). A relation's automatic style changes nothing that layout does. ELK's routes stay dropped, and the canvas draws every route in its style after the layout moves in.
- 2026-10-26 (W48): **placing what an action added joins that action** (ADR 0065). The automatic layout of new shapes asks to join the newest action, and the program records it as part of that action, under its label and author, when ADR 0065's conditions hold; otherwise it stays an action of the person's, `Lay out 3 new shapes in "System overview"`, as above. Layout pressed and Claude's `lay_out_view` stay the person's actions.
- 2026-10-26 (W48): **placing new shapes moves aside what a growing container would cover** (M6's dogfooding found that a container growing with what Claude adds covered its neighbours until a full layout).
  - In each container, and World, innermost first, a container kept there that grew with what layout placed in it, larger than the size it takes around what it keeps, moves aside each unpinned shape stored beside it that it now comes nearer than it was: right, when that shape lay right of it, or down, when it lay below it, whichever moves it less, keeping the room it had from the container, up to 40. The shapes those cover in turn move the same way.
  - Pinned shapes, rows, notes and arrows never move, and a shape moved aside goes past them. A shape that overlapped the container already, or lay above or left of it, stays.
  - It happens before that level's new shapes are placed clear of what stays, so they are placed clear of the moved shapes too, and each move makes the container around it grow, which moves aside what sits beside that one.
  - The moves are stored in the same `set-positions`, unpinned and keeping every stored size, under the new shapes' label; ADR 0065's clarification of this date says when they join the action that added the new shapes.
- 2026-10-26 (M8b, W53): **how layout takes shapes beyond boxes** (`canvas/layout/input.ts`, `engine.ts`).
  - **Anchored parts** are given to layout as contents of their drawing that never move: not free, never moved aside, and never waited for by the automatic layout of new shapes. Each carries its outline's inner point, from the top left of its drawing.
  - **A drawing with parts** is given its picture's bottom, and takes as its size before it grows around its contents its appearance's size or its picture with 24 units of room to its right and below, whichever is larger, as the scene sizes it.
  - **Its other contents** are placed 40 units below its picture, whatever its parts relate to: the picture is kept as what stays at that level.
  - **Its ports.** A relation lifted to the drawing from one of its anchored parts ends on a port on the drawing's side nearest the part's inner point, at the place along it nearest it, rounded to a unit; parts at the same place share a port. Ports keep to the side they are nearest, whichever way the flow runs, and ELK turns around those it must. A part of a drawing that sits deeper in the level's content gets no port, as a row deeper in one gets none.

- 2026-10-29: **ADR 0080 supersedes part of this ADR**, stage by stage as milestone M3c builds it:
  - one hierarchical layout pass with rows as ports;
  - lines beside rows routed like any other, in channels of their own;
  - curves drawn with rounded corners beyond a few lines;
  - every expansion opens in place.

  Read ADR 0080's Consequences for exactly which clarifications it replaces.

<!-- Decided by Claude on 2026-10-31 under the user's standing delegation of design decisions, while building A4's "The main thread". -->

- 2026-10-31 (A4, the main thread; `docs/designs/benchmark-5.md`, "After A4"): **the work around ELK, and the main thread after a layout.**
  - **The routes carried** after a pass (`carriedRoutes`) check each segment against the shapes near it, from a spatial index, not against every shape of the view, and `segmentThrough` makes nothing for each call: on the view of tables the worker's work beside ELK fell from about 4.9 s to 0.2 s, so the whole layout, ELK's 10 to 13 s with it, keeps within the 20 s on the machine this was built on (i9-14900HX). The quality measures, which use the same test, give the same numbers in a twentieth of the time.
  - **The scene after a layout** moves a shape whose stored position only moved, its size and pinning as they were, with what it holds, rather than measuring it again: only what holds it is measured again (`replaceShapes`; `scene.incremental.test.ts` holds it equal to a scene built from nothing). A table's rows, its face and its texts are no longer worked out again because the table moved.
  - **Still over 50 ms, recorded and not held:** on the 10,000 boxes the scene after the layout (lines routed again between every shape that moved) and the canvas's tiles drawn again after it, about 85 and 190 ms in the browser in the same task; the core's applying the command (about 95 ms, the core's own); and on the view of tables, the scene after it when it first runs (about 60 ms, 20 to 45 ms built again). Splitting these over frames, or moving the scene's routing to the routing worker, is a larger change than this task's.
  - **Measured in Node with `tsx`,** whose kept function names cost a property definition for each closure made: the numbers benchmark-5 recorded around ELK were partly that, which the browser's build does not pay.
